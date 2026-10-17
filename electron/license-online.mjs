import { createHash } from 'node:crypto';
import { licenceStatus, readKey, readStatusToken } from './license-core.mjs';

/**
 * The online half of the licence: activating this PC on the website,
 * checking in now and then, and freeing the seat again. The key stays the
 * licence and works offline; the website adds seats per PC, revocation,
 * and renewed keys (a subscription's new expiry, or a plan change's new
 * server limit, are signed into a fresh key the check hands back).
 *
 * Only the key, a random ID for this PC and the PC's name are ever sent.
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
 * }} OnlineContext
 * @typedef {{ kind: 'ok', data: any } | { kind: 'refused', code: string, message: string } | { kind: 'unreachable' }} ApiAnswer
 */

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
export async function callLicenceApi(ctx, action, body) {
    const timeoutMs = ctx.timeoutMs ?? 10_000;
    const controller = new AbortController();
    let timer;

    try {
        const response = await Promise.race([
            ctx.fetch(`${ctx.api}/licenses/${action}`, {
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
 * check. A clear refusal stops the activation with the website's reason;
 * when the website cannot be reached the key is activated offline and
 * marked as not yet confirmed.
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

    return { ok: true, record: answer.kind === 'ok' ? afterActive(record, answer.data, ctx) : { ...record, lastFailedAt: nowOf(ctx).toISOString() } };
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
 * Whether the website's last signed status has run out and a check since
 * then could not reach it. Without a token the key alone counts.
 *
 * @param {LicenceRecord} record
 * @param {string} licenceId
 * @param {Pick<OnlineContext, 'publicPem' | 'statusPrefix' | 'deviceId'>} ctx
 * @param {Date} now
 */
export function offlineTooLong(record, licenceId, ctx, now) {
    const token = tokenFor(record.token, licenceId, ctx);

    if (!token) {
        return false;
    }

    const until = Date.parse(token.valid_until);

    return until < now.getTime() && Boolean(record.lastFailedAt) && Date.parse(record.lastFailedAt) >= until;
}

/**
 * The status the window sees, from what license.json holds.
 *
 * @param {{ saved: (LicenceRecord & { revoked?: boolean }) | { revoked: true } | null, trialStartedAt: string | null, trialDays: number, ctx: Pick<OnlineContext, 'publicPem' | 'keyPrefix' | 'statusPrefix' | 'deviceId'>, now?: Date }} input
 */
export function statusFor({ saved, trialStartedAt, trialDays, ctx, now = new Date() }) {
    const record = saved && 'key' in saved && saved.key ? saved : null;
    const read = record ? readKey(record.key, ctx.publicPem, ctx.keyPrefix) : null;
    const licence = read?.ok ? read.licence : null;
    const status = licenceStatus({
        licence,
        trialStartedAt,
        trialDays,
        now,
        revoked: !licence && Boolean(saved?.revoked),
        offlineExpired: licence && record ? offlineTooLong(record, licence.id, ctx, now) : false,
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
