import { app, net } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import brand from '../brand.json' with { type: 'json' };
import { readKey } from './license-core.mjs';
import { activateOnline, deactivateOnline, statusFor, validateOnline } from './license-online.mjs';
import { PUBLIC_KEY } from './license-public-key.mjs';

/**
 * The licence on this PC: the activated key and what the website last said
 * about it in license.json, the date the free trial started in trial.json
 * (written on the first start), and a random ID for this PC in device.json
 * (not a hardware fingerprint; the website counts seats by it). The demo
 * server always works; real servers need the trial or a licence, up to the
 * plan's number of servers.
 */

const file = (name) => path.join(app.getPath('userData'), name);

async function readJson(name) {
    try {
        return JSON.parse(await readFile(file(name), 'utf8'));
    } catch {
        return null;
    }
}

async function writeJson(name, value) {
    await mkdir(app.getPath('userData'), { recursive: true });
    await writeFile(file(name), JSON.stringify(value, null, 2), 'utf8');
}

async function trialStartedAt() {
    const trial = await readJson('trial.json');

    if (trial?.startedAt) {
        return trial.startedAt;
    }

    const startedAt = new Date().toISOString();
    await writeJson('trial.json', { startedAt });

    return startedAt;
}

/** @type {Promise<string> | null} */
let deviceIdOnce = null;

/** This PC's ID for the website: a random UUID made once. */
function deviceId() {
    deviceIdOnce ??= (async () => {
        const saved = await readJson('device.json');

        if (typeof saved?.id === 'string' && saved.id) {
            return saved.id;
        }

        const id = randomUUID();
        await writeJson('device.json', { id }).catch(() => undefined);

        return id;
    })();

    return deviceIdOnce;
}

/**
 * The licence API, or none: PANEL_LICENSE_API points at another site (like
 * a local copy) or switches it off with "off"; screenshots and click tests
 * stay offline unless pointed somewhere.
 */
function apiBase() {
    const override = process.env.PANEL_LICENSE_API;

    if (override) {
        return override === 'off' ? null : override.replace(/\/+$/, '');
    }

    if (process.env.PANEL_SCREENSHOTS || process.env.PANEL_CLICKTEST || !brand.website) {
        return null;
    }

    return `${brand.website.replace(/\/+$/, '')}/api/v1`;
}

/** @returns {Promise<import('./license-online.mjs').OnlineContext>} */
async function context() {
    return {
        api: apiBase() ?? '',
        // Chromium's network stack: proxies and the Windows certificate store, like a browser.
        fetch: (url, init) => net.fetch(url, init),
        publicPem: PUBLIC_KEY,
        keyPrefix: brand.licenseKeyPrefix,
        statusPrefix: `${brand.licenseKeyPrefix}S`,
        deviceId: await deviceId(),
        deviceName: os.hostname().slice(0, 255),
    };
}

/** Changes to license.json, one after another. */
let queue = Promise.resolve();

function exclusive(run) {
    const next = queue.then(run);
    queue = next.catch(() => undefined);

    return next;
}

export const licence = {
    async status() {
        return statusFor({ saved: await readJson('license.json'), trialStartedAt: await trialStartedAt(), trialDays: brand.trialDays, ctx: await context() });
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

            await writeJson('license.json', result.record);

            return { ok: true, status: await this.status() };
        });
    },

    /**
     * Check in with the website (on start and every few hours): picks up a
     * renewed or upgraded key, and a revocation. Without a key, or offline
     * builds, nothing is sent.
     */
    check() {
        return exclusive(async () => {
            const saved = await readJson('license.json');
            const ctx = await context();

            if (ctx.api && saved?.key) {
                const result = await validateOnline(saved, ctx);
                await writeJson('license.json', 'revoked' in result ? { revoked: true, revokedAt: new Date().toISOString() } : result.record);
            }

            return this.status();
        });
    },

    /** Take the licence off this PC, and free its seat on the website when it answers. */
    remove() {
        return exclusive(async () => {
            const saved = await readJson('license.json');
            const ctx = await context();

            if (ctx.api && saved?.key) {
                await deactivateOnline(saved.key, { ...ctx, timeoutMs: 5000 });
            }

            await rm(file('license.json'), { force: true });

            return this.status();
        });
    },

    /** Whether real servers may be used right now (the plan may still lock some). */
    async unlocked() {
        return (await this.status()).state !== 'expired';
    },
};
