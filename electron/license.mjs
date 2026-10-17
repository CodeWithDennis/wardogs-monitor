import { app } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import brand from '../brand.json' with { type: 'json' };
import { licenceStatus, readKey } from './license-core.mjs';
import { PUBLIC_KEY } from './license-public-key.mjs';

/**
 * The licence on this PC: the activated key in license.json, and the date
 * the free trial started in trial.json (written on the first start). The
 * demo server always works; real servers need the trial or a licence.
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

export const licence = {
    async status() {
        const saved = await readJson('license.json');
        const read = saved?.key ? readKey(saved.key, PUBLIC_KEY, brand.licenseKeyPrefix) : null;

        return { ...licenceStatus({ licence: read?.ok ? read.licence : null, trialStartedAt: await trialStartedAt(), trialDays: brand.trialDays }), trialDays: brand.trialDays };
    },

    /** @param {string} key */
    async activate(key) {
        const read = readKey(key, PUBLIC_KEY, brand.licenseKeyPrefix);

        if (!read.ok) {
            return { ok: false, error: read.error };
        }

        if (read.licence.expires && read.licence.expires < new Date().toISOString().slice(0, 10)) {
            return { ok: false, error: `This licence ended on ${read.licence.expires}. Renew it to get a new key.` };
        }

        await writeJson('license.json', { key: String(key).replace(/\s+/g, ''), activatedAt: new Date().toISOString() });

        return { ok: true, status: await this.status() };
    },

    async remove() {
        await rm(file('license.json'), { force: true });

        return this.status();
    },

    /** Whether real servers may be used right now. */
    async unlocked() {
        return (await this.status()).state !== 'expired';
    },
};
