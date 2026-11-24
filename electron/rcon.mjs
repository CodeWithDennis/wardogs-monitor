/**
 * Talks to a Wardogs dedicated server's HTTP RCON API: plain HTTP/1.1 JSON
 * at http://host:port/v1, with the RCON password as a Bearer token. This is
 * the same API server hosts and community websites use.
 *
 * Every call is made while someone waits, so it gives up quickly. Reads
 * retry once on a dropped connection; writes never retry, so a kick or
 * broadcast is never sent twice.
 */

import pkg from '../package.json' with { type: 'json' };

export const BROADCAST_MAX = 200;
export const MESSAGE_MAX = 200;
export const REASON_MAX = 200;

const CONNECT_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const USER_AGENT = `WardogsMonitor/${pkg.version}`;

/** An error that is safe to show: it never contains the password. */
export class RconError extends Error {
    /**
     * @param {string} message
     * @param {{ unreachable?: boolean, wrongPassword?: boolean, configChanged?: boolean }} [flags]
     */
    constructor(message, flags = {}) {
        super(message);
        this.name = 'RconError';
        this.unreachable = flags.unreachable ?? false;
        this.wrongPassword = flags.wrongPassword ?? false;
        this.configChanged = flags.configChanged ?? false;
    }

    static unreachable() {
        return new RconError('The server did not answer. Check the IP and port, and that the server is running.', { unreachable: true });
    }

    static wrongPassword() {
        return new RconError('The server refused the RCON password.', { wrongPassword: true });
    }

    /** @param {number} status @param {string | null} reason */
    static refused(status, reason) {
        return new RconError(reason ? `The server refused: ${reason}` : `The server answered with HTTP ${status}.`);
    }

    static configChanged() {
        return new RconError('The server\'s settings changed in the meantime. The latest version is loaded now; make your change again.', { configChanged: true });
    }

    static unexpectedAnswer() {
        return new RconError('The server answered with something that is not a Wardogs RCON response.');
    }
}

/**
 * @typedef {{ host: string, port: number, password: string }} Target
 */

/** @param {Target} target */
export function baseUrl(target) {
    const host = target.host.includes(':') && !target.host.startsWith('[') ? `[${target.host}]` : target.host;

    return `http://${host}:${target.port}/v1`;
}

/**
 * @param {Target} target
 * @param {string} method
 * @param {string} endpoint
 * @param {{ json?: unknown, text?: string, headers?: Record<string, string> }} [options]
 */
async function send(target, method, endpoint, options = {}) {
    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${target.password}`,
        'User-Agent': USER_AGENT,
        ...options.headers,
    };

    let body;

    if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.json);
    } else if (options.text !== undefined) {
        headers['Content-Type'] = 'text/plain';
        body = options.text;
    }

    try {
        return await fetch(`${baseUrl(target)}/${endpoint}`, {
            method,
            headers,
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
        });
    } catch {
        throw RconError.unreachable();
    }
}

/** Cancel an unread body so undici releases the socket cleanly. */
function discardBody(response) {
    response.body?.cancel?.().catch(() => {});
}

/**
 * Read a response body as UTF-8 up to `maxBytes` so a hostile or broken
 * endpoint cannot exhaust main-process memory.
 *
 * @param {Response} response
 */
async function readBoundedText(response, maxBytes = MAX_RESPONSE_BYTES) {
    const lengthHeader = Number(response.headers.get('content-length'));

    if (Number.isFinite(lengthHeader) && lengthHeader > maxBytes) {
        discardBody(response);
        throw RconError.unexpectedAnswer();
    }

    if (!response.body) {
        return '';
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            total += value.byteLength;

            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                throw RconError.unexpectedAnswer();
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    return Buffer.concat(chunks, total).toString('utf8');
}

/**
 * The JSON answer of a successful request. Errors come back as
 * {"error": "…"} or {"error": {"code": "…", "message": "…"}}.
 *
 * @param {Response} response
 * @returns {Promise<Record<string, any>>}
 */
async function payload(response) {
    if (response.status === 401 || response.status === 403) {
        discardBody(response);
        throw RconError.wrongPassword();
    }

    let json = null;

    try {
        const text = await readBoundedText(response);
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        if (error instanceof RconError) {
            throw error;
        }

        json = null;
    }

    if (!response.ok) {
        const error = json && typeof json === 'object' ? json.error : null;
        const reason = error && typeof error === 'object' ? error.message : error;

        throw RconError.refused(response.status, typeof reason === 'string' ? reason.slice(0, 300) : null);
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw RconError.unexpectedAnswer();
    }

    return json;
}

/**
 * @param {Target} target
 * @param {string} endpoint
 * @param {string[]} requiredKeys
 */
async function read(target, endpoint, requiredKeys = []) {
    let response;

    try {
        response = await send(target, 'GET', endpoint);
    } catch (error) {
        if (!(error instanceof RconError) || !error.unreachable) {
            throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        response = await send(target, 'GET', endpoint);
    }

    const json = await payload(response);

    for (const key of requiredKeys) {
        if (!(key in json)) {
            throw RconError.unexpectedAnswer();
        }
    }

    return json;
}

/**
 * @param {Target} target
 * @param {'POST' | 'PATCH' | 'DELETE'} method
 * @param {string} endpoint
 * @param {Record<string, unknown>} [body]
 */
async function write(target, method, endpoint, body) {
    const response = await send(target, method, endpoint, body ? { json: body } : {});

    return payload(response);
}

const id = (steamId) => encodeURIComponent(String(steamId));

/** @param {Target} target */
export const rcon = {
    status: (target) => read(target, 'status', ['serverName', 'map', 'players']),
    players: async (target) => (await read(target, 'players', ['players'])).players,
    health: (target) => read(target, 'health', ['status', 'uptimeSeconds']),
    bans: async (target) => (await read(target, 'bans', ['bans'])).bans,
    serverId: async (target) => {
        const answer = await read(target, 'server-id');

        return typeof answer.serverId === 'string' ? answer.serverId : null;
    },
    bannerUrl: async (target) => {
        const answer = await read(target, 'sponsor');

        return typeof answer.imageUrl === 'string' && answer.imageUrl !== '' ? answer.imageUrl : null;
    },
    rotation: (target) => read(target, 'rotation', ['entries']),
    maps: async (target) => (await read(target, 'catalog/maps', ['maps'])).maps,
    lightings: async (target) => (await read(target, 'catalog/lightings', ['lightings'])).lightings,
    experiences: async (target) => (await read(target, 'catalog/experiences', ['experiences'])).experiences,
    mapExperiences: async (target, map) => (await read(target, `catalog/maps/${encodeURIComponent(map)}/experiences`, ['experiences'])).experiences,
    mapAlternators: async (target, map) => (await read(target, `catalog/maps/${encodeURIComponent(map)}/alternators`, ['alternators'])).alternators,

    /**
     * The config document with its revision. The text holds the RCON
     * password, so it never leaves the main process.
     */
    config: (target) => read(target, 'config', ['revision', 'text']),

    /**
     * Replace the config document. The server refuses when it changed since
     * `revision` was read, or when it rejects a value.
     *
     * @param {Target} target
     * @param {string} text
     * @param {string} revision
     */
    async putConfig(target, text, revision) {
        const cleanRevision = String(revision ?? '').replace(/[\r\n"]/g, '');
        const response = await send(target, 'PUT', 'config', { text, headers: { 'If-Match': `"${cleanRevision}"` } });

        if (response.status === 412) {
            discardBody(response);
            throw RconError.configChanged();
        }

        if (response.status === 422) {
            let json = null;

            try {
                const body = await readBoundedText(response);
                json = body ? JSON.parse(body) : null;
            } catch {
                json = null;
            }

            const reasons = (json?.errors ?? [])
                .filter((error) => typeof error?.message === 'string')
                .slice(0, 3)
                .map((error) => `${error.key ?? ''}: ${error.message}`.replace(/^: /, ''));

            if (reasons.length > 0) {
                throw RconError.refused(422, reasons.join(' ').slice(0, 400));
            }

            throw RconError.refused(422, null);
        }

        return payload(response);
    },

    endMatch: (target) => write(target, 'POST', 'match/end'),
    restartMatch: (target) => write(target, 'POST', 'match/restart'),

    /**
     * Travel to a map once the match-end screen finishes.
     *
     * @param {Target} target
     * @param {{ map: string, experiences: string[], lighting?: string | null, zone?: string | null }} change
     */
    changeMap(target, change) {
        const body = { map: change.map };

        if (change.experiences?.length) {
            body.experiences = change.experiences;
        }

        if (change.lighting) {
            body.lighting = change.lighting;
        }

        if (change.zone) {
            body.zoneAlternator = change.zone;
        }

        return write(target, 'POST', 'match/map', body);
    },

    kill: (target, steamId) => write(target, 'POST', `players/${id(steamId)}/kill`),
    changeFaction: (target, steamId, faction) => write(target, 'PATCH', `players/${id(steamId)}`, { faction }),
    kick: (target, steamId, reason) => write(target, 'POST', `players/${id(steamId)}/kick`, { reason }),
    message: (target, steamId, message) => write(target, 'POST', `players/${id(steamId)}/message`, { message }),
    broadcast: (target, message) => write(target, 'POST', 'broadcast', { message }),
    ban: (target, steamId, reason) => write(target, 'POST', 'bans', reason ? { steamId, reason } : { steamId }),
    unban: (target, steamId) => write(target, 'DELETE', `bans/${id(steamId)}`),
};
