import { createHash } from 'node:crypto';
import { licenceStatus, readKey, readStatusToken, readTrialToken } from './license-core.mjs';

/**
 * The online half of the licence: activating this PC on the website,
 * checking in now and then, freeing the seat again, and the free trial.
 * The website is the source of truth: a key only counts on a PC the
 * website confirmed, through a signed status token bound to that PC, and
 * only until the token's `valid_until` (the offline grace). A trial's dates
 * come from the website the same way. Offline use is fine, but only after
 * that first confirmation, and never past the grace or with the clock
 * turned back.
 *
 * Only the key, an ID for this PC and the PC's name are ever sent.
 * Nothing here logs, and nothing here touches Electron or files: the caller
 * passes `fetch` and keeps the record, so it can be tested on its own.
 */

/** How often a running app checks in. */
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * What license.json holds. `token` is the website's last signed status;
 * `lastCheckedAt` the last check that got an answer, `lastFailedAt` the last
 * one that could not reach the website (cleared by the next answer).
 *
 * @typedef {{ status: string | null, interval: string | null, renews_at: string | null, cancel_at_period_end: boolean }} Subscription
 * @typedef {{
 *   key: string,
 *   activatedAt: string,
 *   token?: string | null,
 *   subscription?: Subscription | null,
 *   seats?: { used: number, max: number } | null,
 *   lastCheckedAt?: string | null,
 *   lastFailedAt?: string | null,
 *   onlineConfirmed?: boolean,
 *   onlineError?: string | null,
 * }} LicenceRecord
 * @typedef {{
 *   api: string,
 *   fetch: (url: string, init: object) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>,
 *   publicPem: string,
 *   keyPrefix: string,
 *   statusPrefix: string,
 *   deviceId: string,
 *   deviceName: string,
 *   timeoutMs?: number,
 *   now?: () => Date,
 *   allowUnconfirmed?: boolean,
 * }} OnlineContext
 * @typedef {{ kind: 'ok', data: any } | { kind: 'refused', code: string, message: string } | { kind: 'unreachable' }} ApiAnswer
 */

/** How far the clock may sit behind the website's own time, or behind the latest time seen, before it counts as turned back. */
export const CLOCK_SKEW_MS = 10 * 60 * 1000;
export const CLOCK_BACK_MS = 60 * 60 * 1000;

/** The website keeps only this hash of the device ID; tokens carry it too. */
export const hashDevice = (deviceId) => createHash('sha256').update(String(deviceId)).digest('hex');

const nowOf = (ctx) => (ctx.now ? ctx.now() : new Date());

const REFUSED = {
    invalid: 'This licence key is not valid. Check that it was copied completely.',
    revoked: 'This licence key has been revoked.',
    expired: 'This licence has expired.',
    limit_reached: 'This licence is already in use on the maximum number of PCs. Deactivate it on another PC first.',
    not_activated: 'This licence is not activated on this PC.',
};

const UNREACHABLE = 'Could not reach wardogsmonitor.com. A licence is activated online once; check the internet connection and try again.';

/**
 * POST to the licence API. A 403 or 422 is a clear answer ("refused");
 * anything else that is not a success (no network, a timeout, the site
 * down or busy) counts as unreachable, so it never locks anyone out.
 *
 * @param {OnlineContext} ctx
 * @param {'activate' | 'validate' | 'deactivate'} action
 * @param {{ key: string, device_id: string, device_name?: string }} body
 * @returns {Promise<ApiAnswer>}
 */
export function callLicenceApi(ctx, action, body) {
    return callApi(ctx, `licenses/${action}`, body);
}

/**
 * @param {OnlineContext} ctx
 * @param {string} path
 * @param {object} body
 * @returns {Promise<ApiAnswer>}
 */
async function callApi(ctx, path, body) {
    const timeoutMs = ctx.timeoutMs ?? 10_000;
    const controller = new AbortController();
    let timer;

    try {
        const response = await Promise.race([
            ctx.fetch(`${ctx.api}/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            }),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new Error('timeout'));
                }, timeoutMs);
            }),
        ]);

        const data = await response.json().catch(() => null);

        if (response.ok) {
            return data && typeof data === 'object' ? { kind: 'ok', data } : { kind: 'unreachable' };
        }

        if (response.status === 403 || response.status === 422) {
            // A 422 without a status is Laravel's own validation answer: the key was not accepted.
            const code = typeof data?.status === 'string' ? data.status : 'invalid';

            return { kind: 'refused', code, message: REFUSED[code] ?? (typeof data?.message === 'string' ? data.message : REFUSED.invalid) };
        }

        return { kind: 'unreachable' };
    } catch {
        return { kind: 'unreachable' };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * A status token from the website, if it is genuine and about this licence
 * on this PC.
 *
 * @param {string | null | undefined} token
 * @param {string} licenceId
 * @param {Pick<OnlineContext, 'publicPem' | 'statusPrefix' | 'deviceId'>} ctx
 */
export function tokenFor(token, licenceId, ctx) {
    const status = token ? readStatusToken(token, ctx.publicPem, ctx.statusPrefix) : null;

    return status && status.licence_id === licenceId && status.device === hashDevice(ctx.deviceId) ? status : null;
}

/** @returns {Subscription | null} */
function cleanSubscription(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const text = (field) => (typeof value[field] === 'string' ? value[field] : null);

    return { status: text('status'), interval: text('interval'), renews_at: text('renews_at'), cancel_at_period_end: value.cancel_at_period_end === true };
}

function cleanSeats(value) {
    return value && Number.isInteger(value.used) && Number.isInteger(value.max) ? { used: value.used, max: value.max } : null;
}

/**
 * The record after an "active" answer: the newer key when the website
 * signed one for the same licence, its status token, the subscription.
 *
 * @param {LicenceRecord} record
 * @param {any} data
 * @param {OnlineContext} ctx
 * @returns {LicenceRecord}
 */
function afterActive(record, data, ctx) {
    const current = readKey(record.key, ctx.publicPem, ctx.keyPrefix);
    const offered = typeof data.key === 'string' ? data.key.replace(/\s+/g, '') : null;
    const fresh = offered ? readKey(offered, ctx.publicPem, ctx.keyPrefix) : null;
    const key = current.ok && fresh?.ok && fresh.licence.id === current.licence.id ? offered : record.key;
    const licenceId = current.ok ? current.licence.id : null;

    return {
        ...record,
        key,
        token: licenceId && tokenFor(data.token, licenceId, ctx) ? data.token : null,
        subscription: cleanSubscription(data.subscription),
        seats: cleanSeats(data.activations) ?? (Number.isInteger(data.licence?.max_activations) ? { used: 0, max: data.licence.max_activations } : null),
        lastCheckedAt: nowOf(ctx).toISOString(),
        lastFailedAt: null,
        onlineConfirmed: true,
        onlineError: null,
    };
}

/**
 * Activate a key on this PC. The key must already have passed the offline
 * check. The website must answer: a refusal stops the activation with its
 * reason, and so does no answer at all, as a key that was never confirmed
 * online for this PC would let one key run on any number of PCs.
 *
 * @param {string} key
 * @param {OnlineContext} ctx
 * @returns {Promise<{ ok: true, record: LicenceRecord } | { ok: false, code: string, error: string }>}
 */
export async function activateOnline(key, ctx) {
    const clean = String(key).replace(/\s+/g, '');
    /** @type {LicenceRecord} */
    const record = { key: clean, activatedAt: nowOf(ctx).toISOString(), token: null, subscription: null, seats: null, lastCheckedAt: null, lastFailedAt: null, onlineConfirmed: false, onlineError: null };
    const answer = await callLicenceApi(ctx, 'activate', { key: clean, device_id: ctx.deviceId, device_name: ctx.deviceName });

    if (answer.kind === 'refused') {
        return { ok: false, code: answer.code, error: answer.message };
    }

    if (answer.kind === 'unreachable') {
        return { ok: false, code: 'unreachable', error: UNREACHABLE };
    }

    const activated = afterActive(record, answer.data, ctx);

    // An answer without a genuine token for this PC is no confirmation.
    return activated.token ? { ok: true, record: activated } : { ok: false, code: 'invalid', error: REFUSED.invalid };
}

/**
 * What a refusal leaves of the record: revoked (or a key the website no
 * longer knows) removes it; anything else keeps the key, so the status
 * follows its own expiry, and shows the website's reason.
 *
 * @param {LicenceRecord} record
 * @param {{ code: string, message: string }} refusal
 * @param {OnlineContext} ctx
 * @returns {{ revoked: true } | { record: LicenceRecord }}
 */
function afterRefusal(record, refusal, ctx) {
    if (refusal.code === 'revoked' || refusal.code === 'invalid') {
        return { revoked: true };
    }

    return { record: { ...record, token: null, lastCheckedAt: nowOf(ctx).toISOString(), lastFailedAt: null, onlineConfirmed: false, onlineError: refusal.message } };
}

/**
 * The regular check-in. A PC the website does not know yet (activated
 * offline, or a reinstall) is activated once.
 *
 * @param {LicenceRecord} record
 * @param {OnlineContext} ctx
 * @returns {Promise<{ revoked: true } | { record: LicenceRecord }>}
 */
export async function validateOnline(record, ctx) {
    const answer = await callLicenceApi(ctx, 'validate', { key: record.key, device_id: ctx.deviceId });

    if (answer.kind === 'ok') {
        return { record: afterActive(record, answer.data, ctx) };
    }

    if (answer.kind === 'unreachable') {
        return { record: { ...record, lastFailedAt: nowOf(ctx).toISOString() } };
    }

    if (answer.code !== 'not_activated') {
        return afterRefusal(record, answer, ctx);
    }

    const again = await callLicenceApi(ctx, 'activate', { key: record.key, device_id: ctx.deviceId, device_name: ctx.deviceName });

    if (again.kind === 'ok') {
        return { record: afterActive(record, again.data, ctx) };
    }

    return again.kind === 'unreachable' ? { record: { ...record, lastFailedAt: nowOf(ctx).toISOString() } } : afterRefusal(record, again, ctx);
}

/**
 * Free this PC's seat, best effort: true when the website answered.
 *
 * @param {string} key
 * @param {OnlineContext} ctx
 */
export async function deactivateOnline(key, ctx) {
    return (await callLicenceApi(ctx, 'deactivate', { key, device_id: ctx.deviceId })).kind === 'ok';
}

/**
 * Whether the PC's clock was turned back: behind the time the website
 * signed into a token, or well behind the latest time this app has seen.
 *
 * @param {Date} now
 * @param {string | null | undefined} checked The website's time in a token.
 * @param {number | null | undefined} latestSeen The latest time seen, in ms.
 */
export function clockTurnedBack(now, checked, latestSeen) {
    const signed = checked ? Date.parse(checked) : NaN;

    return (Number.isFinite(signed) && now.getTime() < signed - CLOCK_SKEW_MS) || (Number.isFinite(latestSeen) && now.getTime() < Number(latestSeen) - CLOCK_BACK_MS);
}

/**
 * What locks a valid key on this PC: no genuine token for it ('unconfirmed'),
 * the token's grace ran out ('offline'), or the clock was turned back
 * ('clock'). Null when it may run.
 *
 * @param {LicenceRecord} record
 * @param {string} licenceId
 * @param {Pick<OnlineContext, 'publicPem' | 'statusPrefix' | 'deviceId' | 'allowUnconfirmed'>} ctx
 * @param {Date} now
 * @param {number | null} [latestSeen]
 * @returns {'unconfirmed' | 'offline' | 'clock' | null}
 */
export function licenceLock(record, licenceId, ctx, now, latestSeen = null) {
    const token = tokenFor(record.token, licenceId, ctx);

    if (!token) {
        return ctx.allowUnconfirmed ? null : 'unconfirmed';
    }

    if (clockTurnedBack(now, token.checked, latestSeen)) {
        return 'clock';
    }

    return Date.parse(token.valid_until) >= now.getTime() ? null : 'offline';
}

/**
 * A trial token from the website, if it is genuine and about this PC.
 *
 * @param {string | null | undefined} token
 * @param {Pick<OnlineContext, 'publicPem' | 'statusPrefix' | 'deviceId'>} ctx
 */
export function trialFor(token, ctx) {
    const trial = token ? readTrialToken(token, ctx.publicPem, ctx.statusPrefix) : null;

    return trial && trial.device === hashDevice(ctx.deviceId) ? trial : null;
}

/**
 * Ask the website for this PC's trial: it starts it on the first call and
 * hands back the same dates on every call after, signed for this PC.
 *
 * @param {OnlineContext} ctx
 * @returns {Promise<{ ok: true, token: string } | { ok: false }>}
 */
export async function startTrialOnline(ctx) {
    const answer = await callApi(ctx, 'trials/start', { device_id: ctx.deviceId });
    const token = answer.kind === 'ok' && typeof answer.data.token === 'string' ? answer.data.token : null;

    return token && trialFor(token, ctx) ? { ok: true, token } : { ok: false };
}

/**
 * The status the window sees, from what license.json holds.
 *
 * The trial counts from the website's signed `trialToken`; without one it
 * is locked until the website hands one out, except where
 * `ctx.allowUnconfirmed` (development and screenshot runs, never a
 * packaged app) lets `trialStartedAt` stand in.
 *
 * @param {{ saved: (LicenceRecord & { revoked?: boolean }) | { revoked: true } | null, trialToken?: string | null, trialStartedAt?: string | null, trialDays: number, ctx: Pick<OnlineContext, 'publicPem' | 'keyPrefix' | 'statusPrefix' | 'deviceId' | 'allowUnconfirmed'>, now?: Date, latestSeen?: number | null }} input
 */
export function statusFor({ saved, trialToken = null, trialStartedAt = null, trialDays, ctx, now = new Date(), latestSeen = null }) {
    const record = saved && 'key' in saved && saved.key ? saved : null;
    const read = record ? readKey(record.key, ctx.publicPem, ctx.keyPrefix) : null;
    const licence = read?.ok ? read.licence : null;
    const trial = trialFor(trialToken, ctx);
    const status = licenceStatus({
        licence,
        trialStartedAt: trial ? trial.started : trialStartedAt,
        trialEndsAt: trial?.ends ?? null,
        trialDays,
        now,
        revoked: !licence && Boolean(saved?.revoked),
        lock: licence && record ? licenceLock(record, licence.id, ctx, now, latestSeen) : null,
        trialLock: trial ? (clockTurnedBack(now, trial.checked, latestSeen) ? 'clock' : null) : ctx.allowUnconfirmed ? null : 'unconfirmed',
    });
    const kept = licence && record ? record : null;

    return {
        ...status,
        trialDays,
        subscription: kept?.subscription ?? null,
        seats: kept?.seats ?? null,
        lastCheckedAt: kept?.lastCheckedAt ?? null,
        onlineConfirmed: Boolean(kept?.onlineConfirmed),
        onlineError: kept?.onlineError ?? null,
    };
}
