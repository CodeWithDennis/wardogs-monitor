import { app, net, safeStorage } from 'electron';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import brand from '../brand.json' with { type: 'json' };
import { readKey, readStatusToken, readTrialToken } from './license-core.mjs';
import { activateOnline, deactivateOnline, startTrialOnline, statusFor, validateOnline } from './license-online.mjs';
import { PUBLIC_KEY } from './license-public-key.mjs';

/**
 * The licence on this PC, kept in licence.dat, encrypted with Windows DPAPI
 * (Electron's safeStorage) so it can't be read or edited by hand, nor copied
 * to another PC or Windows account: the activated key with what the website
 * last signed about it, the website's signed trial dates, and the latest
 * time this app has seen (a clock turned back past it locks the app until
 * the website confirms again). The website is the source of truth for both
 * the licence and the trial (see license-online.mjs).
 *
 * This PC's ID comes from Windows' own machine ID, hashed with the app's
 * name, so seats follow the PC and not a file that could be copied along.
 *
 * Test runs (an app started from the source, never a packaged one) may
 * point at another website with PANEL_LICENSE_API, or work without one.
 */

const execFileAsync = promisify(execFile);
const development = !app.isPackaged;
const file = (name) => path.join(app.getPath('userData'), name);
const STATE = 'licence.dat';

/** The latest time seen is written at most this often; it is kept in memory between. */
const SEEN_EVERY_MS = 10 * 60 * 1000;

/**
 * @typedef {{
 *   record?: (import('./license-online.mjs').LicenceRecord & { revoked?: boolean }) | { revoked: true, revokedAt: string } | null,
 *   trialToken?: string | null,
 *   latestSeen?: number | null,
 *   localTrialStartedAt?: string | null,
 *   fallbackDeviceId?: string | null,
 * }} LicenceState
 */

/** @type {Promise<LicenceState> | null} */
let stateOnce = null;
let seenWrittenAt = 0;

/** What licence.dat holds; nothing (a fresh start) when it is missing, from another PC, or tampered with. */
async function readState() {
    try {
        return JSON.parse(safeStorage.decryptString(await readFile(file(STATE))));
    } catch {
        return migrateOldFiles();
    }
}

/**
 * Builds before licence.dat kept the key in plain license.json: carry the
 * key over (it must be confirmed online again) and drop the old files.
 */
async function migrateOldFiles() {
    let key = null;

    try {
        key = JSON.parse(await readFile(file('license.json'), 'utf8'))?.key ?? null;
    } catch {
        // Nothing to carry over.
    }

    await Promise.all(['license.json', 'trial.json', 'device.json'].map((name) => rm(file(name), { force: true })));

    return typeof key === 'string' && key ? { record: { key, activatedAt: new Date().toISOString() } } : {};
}

function state() {
    stateOnce ??= readState();

    return stateOnce;
}

/** @param {(current: LicenceState) => LicenceState} change */
async function saveState(change) {
    const next = change(await state());
    stateOnce = Promise.resolve(next);
    await mkdir(app.getPath('userData'), { recursive: true });
    const temporary = `${file(STATE)}.${randomUUID()}.tmp`;
    await writeFile(temporary, safeStorage.encryptString(JSON.stringify(next)));
    await rename(temporary, file(STATE));
    seenWrittenAt = Date.now();

    return next;
}

/** Windows' machine ID (set when Windows is installed), or null if it can't be read. */
async function machineGuid() {
    try {
        const { stdout } = await execFileAsync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { windowsHide: true, timeout: 5000 });

        return stdout.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/)?.[1]?.toLowerCase() ?? null;
    } catch {
        return null;
    }
}

/** @type {Promise<string> | null} */
let deviceIdOnce = null;

/** This PC's ID for the website: from the machine ID, or a random one kept in licence.dat when that can't be read. */
function deviceId() {
    deviceIdOnce ??= (async () => {
        const guid = await machineGuid();

        if (guid) {
            return createHash('sha256').update(`${brand.appId}/${guid}`).digest('hex');
        }

        const saved = (await state()).fallbackDeviceId;

        if (saved) {
            return saved;
        }

        const id = randomUUID();
        await saveState((current) => ({ ...current, fallbackDeviceId: id })).catch(() => undefined);

        return id;
    })();

    return deviceIdOnce;
}

/**
 * The licence API. A packaged app always uses the website's; a test run
 * may point PANEL_LICENSE_API elsewhere (or "off"), and screenshots and
 * click tests run without one.
 */
function apiBase() {
    if (development) {
        const override = process.env.PANEL_LICENSE_API;

        if (override) {
            return override === 'off' ? null : override.replace(/\/+$/, '');
        }

        if (process.env.PANEL_SCREENSHOTS || process.env.PANEL_CLICKTEST) {
            return null;
        }
    }

    return `${brand.website.replace(/\/+$/, '')}/api/v1`;
}

/** @returns {Promise<import('./license-online.mjs').OnlineContext>} */
async function context() {
    const api = apiBase();

    return {
        api: api ?? '',
        // Chromium's network stack: proxies and the Windows certificate store, like a browser.
        fetch: (url, init) => net.fetch(url, init),
        publicPem: PUBLIC_KEY,
        keyPrefix: brand.licenseKeyPrefix,
        statusPrefix: `${brand.licenseKeyPrefix}S`,
        deviceId: await deviceId(),
        deviceName: os.hostname().slice(0, 255),
        // Only a test run without a website may go without the website's confirmation.
        allowUnconfirmed: development && !api,
    };
}

/** Changes to the licence, one after another. */
let queue = Promise.resolve();

function exclusive(run) {
    const next = queue.then(run);
    queue = next.catch(() => undefined);

    return next;
}

/** Remember the latest time seen, so a clock turned back can be told apart. */
async function noteTime(current, now) {
    const latest = Math.max(Number(current.latestSeen) || 0, now.getTime());

    if (latest === current.latestSeen) {
        return current;
    }

    const next = { ...current, latestSeen: latest };

    if (Date.now() - seenWrittenAt > SEEN_EVERY_MS) {
        return saveState((saved) => ({ ...saved, latestSeen: Math.max(Number(saved.latestSeen) || 0, latest) })).catch(() => next);
    }

    stateOnce = Promise.resolve(next);

    return next;
}

export const licence = {
    async status() {
        const ctx = await context();
        const now = new Date();
        const current = await state();
        // The latest time seen before this moment: a check against it, then this moment joins it.
        const latestSeen = current.latestSeen ?? null;
        let local = current;

        if (ctx.allowUnconfirmed && !current.localTrialStartedAt) {
            local = await saveState((saved) => ({ ...saved, localTrialStartedAt: now.toISOString() }));
        }

        await noteTime(local, now);

        return statusFor({ saved: local.record ?? null, trialToken: local.trialToken ?? null, trialStartedAt: local.localTrialStartedAt ?? null, trialDays: brand.trialDays, ctx, now, latestSeen });
    },

    /** @param {string} key */
    activate(key) {
        return exclusive(async () => {
            const read = readKey(key, PUBLIC_KEY, brand.licenseKeyPrefix);

            if (!read.ok) {
                return { ok: false, error: read.error };
            }

            if (read.licence.expires && read.licence.expires < new Date().toISOString().slice(0, 10)) {
                return { ok: false, error: `This licence ended on ${read.licence.expires}. Renew it to get a new key.` };
            }

            const clean = String(key).replace(/\s+/g, '');
            const ctx = await context();
            const result = ctx.api ? await activateOnline(clean, ctx) : { ok: true, record: { key: clean, activatedAt: new Date().toISOString(), onlineConfirmed: false } };

            if (!result.ok) {
                return { ok: false, error: result.error };
            }

            await saveState((current) => ({ ...current, record: result.record }));

            return { ok: true, status: await this.status() };
        });
    },

    /**
     * Check in with the website (on start and every few hours): picks up a
     * renewed or upgraded key and a revocation, and a fresh signed status
     * that keeps offline use going. Without a key it fetches this PC's trial
     * dates (the same ones every time; a fresh signature puts a clock right).
     */
    check() {
        return exclusive(async () => {
            const current = await state();
            const ctx = await context();
            const record = current.record && 'key' in current.record ? current.record : null;

            if (ctx.api && record?.key) {
                const result = await validateOnline(record, ctx);
                const confirmed = 'record' in result && result.record.token ? readStatusToken(result.record.token, PUBLIC_KEY, ctx.statusPrefix) : null;

                await saveState((saved) => ({
                    ...saved,
                    record: 'revoked' in result ? { revoked: true, revokedAt: new Date().toISOString() } : result.record,
                    // The website's own time replaces the latest time seen, so a clock that ran ahead and was put right doesn't stay locked.
                    latestSeen: confirmed ? Date.parse(confirmed.checked) : saved.latestSeen,
                }));
            } else if (ctx.api) {
                const trial = await startTrialOnline(ctx);

                if (trial.ok) {
                    const checked = readTrialToken(trial.token, PUBLIC_KEY, ctx.statusPrefix)?.checked;
                    await saveState((saved) => ({ ...saved, trialToken: trial.token, latestSeen: checked ? Date.parse(checked) : saved.latestSeen }));
                }
            }

            return this.status();
        });
    },

    /** Take the licence off this PC, and free its seat on the website when it answers. */
    remove() {
        return exclusive(async () => {
            const current = await state();
            const ctx = await context();
            const record = current.record && 'key' in current.record ? current.record : null;

            if (ctx.api && record?.key) {
                await deactivateOnline(record.key, { ...ctx, timeoutMs: 5000 });
            }

            await saveState((saved) => ({ ...saved, record: null }));

            return this.status();
        });
    },

    /** Whether real servers may be used right now (the plan may still lock some). */
    async unlocked() {
        return (await this.status()).state !== 'expired';
    },
};
