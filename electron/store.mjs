import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readGroups, toFile } from './banlists.mjs';
import { change, resolve } from './preferences.mjs';

/**
 * The app's own files in its data folder under %APPDATA%: the saved
 * servers, preferences, linked ban lists and a local log of every action
 * taken. RCON passwords are encrypted with Windows DPAPI (Electron's
 * safeStorage), so only this Windows account can read them, and they never
 * reach the window.
 */

const file = (name) => path.join(app.getPath('userData'), name);

async function readJson(name, fallback) {
    try {
        return JSON.parse(await readFile(file(name), 'utf8'));
    } catch {
        return fallback;
    }
}

/**
 * Windows refuses to replace a file while something has it open (a read
 * from this app, a virus scanner), so a refused rename is tried again for
 * a moment before it counts as failed.
 */
async function replace(temporary, target) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await rename(temporary, target);
        } catch (error) {
            if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) {
                await rm(temporary, { force: true });
                throw error;
            }

            await new Promise((done) => setTimeout(done, 25 * (attempt + 1)));
        }
    }
}

/**
 * Write through a temporary file, so a crash never leaves half a file.
 * Writes per file go one after another, so two saves at once never trip
 * over each other.
 */
const writing = new Map();

function writeJson(name, value) {
    const run = async () => {
        await mkdir(app.getPath('userData'), { recursive: true });
        const target = file(name);
        // Each write gets its own temporary file, so a second save can't rename the first one's away.
        const temporary = `${target}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
        await replace(temporary, target);
    };

    const next = (writing.get(name) ?? Promise.resolve()).then(run, run);
    writing.set(name, next.catch(() => undefined));

    return next;
}

function encrypt(password) {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Windows could not protect the password on this account, so it was not saved.');
    }

    return safeStorage.encryptString(password).toString('base64');
}

function decrypt(secret) {
    return safeStorage.decryptString(Buffer.from(secret, 'base64'));
}

/**
 * @typedef {{ id: string, name: string, host: string, port: number, secret: string, demo?: boolean }} StoredServer
 * @typedef {{ id: string, name: string, host: string, port: number, demo: boolean }} PublicServer
 */

/** @param {StoredServer} server @returns {PublicServer} */
const publicServer = (server) => ({ id: server.id, name: server.name, host: server.host, port: server.port, demo: Boolean(server.demo) });

export const servers = {
    /** @returns {Promise<StoredServer[]>} */
    async all() {
        return readJson('servers.json', []);
    },

    async list() {
        return (await this.all()).map(publicServer);
    },

    /** The address and password to reach a server, for the main process only. */
    async target(id) {
        const server = (await this.all()).find((entry) => entry.id === id);

        if (!server) {
            throw new Error('That server is no longer saved.');
        }

        return { host: server.host, port: server.port, password: decrypt(server.secret) };
    },

    /**
     * Add a server, or update one. A blank password keeps the saved one.
     *
     * @param {{ id?: string, name: string, host: string, port: number, password?: string, demo?: boolean }} input
     */
    async save(input) {
        const all = await this.all();
        const existing = input.id ? all.find((entry) => entry.id === input.id) : undefined;

        /** @type {StoredServer} */
        const server = {
            id: existing?.id ?? randomUUID(),
            name: input.name,
            host: input.host,
            port: input.port,
            secret: input.password ? encrypt(input.password) : existing?.secret ?? '',
            demo: input.demo ?? existing?.demo ?? false,
        };

        await writeJson('servers.json', existing ? all.map((entry) => (entry.id === server.id ? server : entry)) : [...all, server]);

        return publicServer(server);
    },

    async remove(id) {
        await writeJson('servers.json', (await this.all()).filter((entry) => entry.id !== id));
    },

    async reorder(ids) {
        const all = await this.all();
        const sorted = [...all].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        await writeJson('servers.json', sorted);
    },
};

export { DEFAULT_PREFERENCES, ZOOM_STEPS } from './preferences.mjs';

export const preferences = {
    async get() {
        return resolve(await readJson('preferences.json', {}));
    },

    async set(changes) {
        const { toStore, preferences: next } = change(await readJson('preferences.json', {}), changes);
        await writeJson('preferences.json', toStore);

        return next;
    },
};

/**
 * A local log of every action taken from this app, one JSON line each. The
 * website logs its own actions; this keeps the same trail for the desktop.
 */
export const activity = {
    /** @param {{ serverId: string, serverName: string, action: string, summary: string, ok: boolean, error?: string }} entry */
    async add(entry) {
        await mkdir(app.getPath('userData'), { recursive: true });
        await appendFile(file('activity.log'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
    },

    /** The newest entries first. */
    async list(serverId, limit = 200) {
        let text = '';

        try {
            text = await readFile(file('activity.log'), 'utf8');
        } catch {
            return [];
        }

        return text
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((entry) => entry && (!serverId || entry.serverId === serverId))
            .reverse()
            .slice(0, limit);
    },
};

/**
 * Linked ban lists (see banlists.mjs), in banlists.json. Changes are made
 * one after another, so a ban recorded while a sync finishes is never lost
 * to two writes racing.
 */
let banListQueue = Promise.resolve();

export const banLists = {
    /** @returns {Promise<import('./banlists.mjs').BanGroup[]>} */
    async list() {
        return readGroups(await readJson('banlists.json', {}));
    },

    /**
     * Change the groups: `change` gets them as stored and returns the new
     * list (or nothing to leave them as they are), plus anything to hand back.
     *
     * @template T
     * @param {(groups: import('./banlists.mjs').BanGroup[]) => { groups?: import('./banlists.mjs').BanGroup[], result?: T } | Promise<{ groups?: import('./banlists.mjs').BanGroup[], result?: T }>} change
     * @returns {Promise<T | undefined>}
     */
    update(change) {
        const run = banListQueue.then(async () => {
            const { groups, result } = await change(await this.list());

            if (groups) {
                await writeJson('banlists.json', toFile(groups));
            }

            return result;
        });

        banListQueue = run.catch(() => undefined);

        return run;
    },
};
