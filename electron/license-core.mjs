import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

/**
 * Licence keys, checked offline. A key is the licence itself (who it is
 * for, the plan, how many servers, when it ends) signed with the seller's
 * Ed25519 private key; the app holds only the public key, so it can tell a
 * real key from a made-up one but can never make one. Keys look like
 * PREFIX-<licence>.<signature>, both base64url. The website's status tokens
 * (WDMS-…) are signed the same way.
 *
 * No Electron and no files here, so it can be tested on its own.
 */

/**
 * `servers` is how many real servers the plan runs, null for unlimited
 * (keys made before plans had limits have no such field: unlimited too).
 *
 * @typedef {{ v: 1, id: string, name: string, email: string, plan: string, servers: number | null, issued: string, expires: string | null }} Licence
 */

const DAY = 86_400_000;

/** How many real servers the free trial runs: as many as the paid plan, which is unlimited. */
export const TRIAL_SERVERS = null;

/** @param {string} pem */
export function keyFromPem(pem, kind) {
    return kind === 'private' ? createPrivateKey(pem) : createPublicKey(pem);
}

/**
 * Sign a JSON payload as PREFIX-<body>.<signature>.
 *
 * @param {object} payload
 * @param {string} privatePem
 * @param {string} prefix
 */
export function signPayload(payload, privatePem, prefix) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = sign(null, Buffer.from(body), keyFromPem(privatePem, 'private')).toString('base64url');

    return `${prefix}-${body}.${signature}`;
}

/**
 * Make a key for someone (the seller's side, see scripts/license).
 *
 * @param {{ name: string, email: string, plan?: string, servers?: number | null, days?: number | null }} who
 * @param {string} privatePem
 * @param {string} prefix
 * @param {Date} [now]
 */
export function issueKey(who, privatePem, prefix, now = new Date()) {
    /** @type {Licence} */
    const licence = {
        v: 1,
        id: randomUUID(),
        name: String(who.name).trim(),
        email: String(who.email).trim(),
        plan: who.plan ?? 'standard',
        servers: who.servers ?? null,
        issued: now.toISOString().slice(0, 10),
        expires: who.days ? new Date(now.getTime() + who.days * DAY).toISOString().slice(0, 10) : null,
    };

    return signPayload(licence, privatePem, prefix);
}

/**
 * Check a signed PREFIX-<body>.<signature> string and read its JSON body.
 * Spaces and line breaks from copying are ignored.
 *
 * @param {string} text
 * @param {string} publicPem
 * @param {string} prefix
 * @returns {{ ok: true, payload: any } | { ok: false, why: 'format' | 'signature' | 'json' }}
 */
function readSigned(text, publicPem, prefix) {
    const clean = String(text ?? '').replace(/\s+/g, '');
    const match = clean.match(new RegExp(`^${prefix}-([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`));

    if (!match) {
        return { ok: false, why: 'format' };
    }

    const [, body, signature] = match;
    let genuine = false;

    try {
        genuine = verify(null, Buffer.from(body), keyFromPem(publicPem, 'public'), Buffer.from(signature, 'base64url'));
    } catch {
        genuine = false;
    }

    if (!genuine) {
        return { ok: false, why: 'signature' };
    }

    try {
        return { ok: true, payload: JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) };
    } catch {
        return { ok: false, why: 'json' };
    }
}

/**
 * Read and check a key. Spaces and line breaks from copying are ignored.
 *
 * @param {string} key
 * @param {string} publicPem
 * @param {string} prefix
 * @returns {{ ok: true, licence: Licence } | { ok: false, error: string }}
 */
export function readKey(key, publicPem, prefix) {
    const read = readSigned(key, publicPem, prefix);

    if (!read.ok) {
        return {
            ok: false,
            error:
                read.why === 'format'
                    ? `That is not a licence key. Keys start with ${prefix}- and are pasted in one piece.`
                    : read.why === 'signature'
                      ? 'This licence key is not valid. Check that it was copied completely.'
                      : 'This licence key is not valid.',
        };
    }

    const licence = read.payload;

    if (licence?.v !== 1) {
        return { ok: false, error: 'This licence key is for a newer version of the app.' };
    }

    const servers = Number.isInteger(licence.servers) && licence.servers >= 0 ? licence.servers : null;

    return { ok: true, licence: { ...licence, servers } };
}

/**
 * Read a status token from the website's licence API: proof, signed with
 * the same key pair, that a licence was active on a device when it was
 * checked, and until when the app may trust that offline.
 *
 * @param {string} token
 * @param {string} publicPem
 * @param {string} prefix
 * @returns {{ v: number, licence_id: string, device: string, status: string, checked: string, valid_until: string } | null}
 */
export function readStatusToken(token, publicPem, prefix) {
    const read = readSigned(token, publicPem, prefix);
    const status = read.ok ? read.payload : null;

    return status && typeof status.licence_id === 'string' && typeof status.device === 'string' && typeof status.valid_until === 'string' ? status : null;
}

/**
 * Where the app stands: licensed, in its trial, or locked, and how many real
 * servers that runs (`maxServers`, null for unlimited, 0 when locked).
 *
 * `revoked` is set when the website said the licence on this PC was revoked
 * (its key is then gone); `offlineExpired` when the website could not be
 * reached since the last signed status ran out.
 *
 * @param {{ licence: Licence | null, trialStartedAt: string | null, trialDays: number, now?: Date, revoked?: boolean, offlineExpired?: boolean }} input
 */
export function licenceStatus({ licence, trialStartedAt, trialDays, now = new Date(), revoked = false, offlineExpired = false }) {
    const today = now.toISOString().slice(0, 10);
    const who = licence ? { licensee: licence.name, email: licence.email, plan: licence.plan, expires: licence.expires } : { licensee: null, email: null, plan: null, expires: null };

    if (licence && (!licence.expires || licence.expires >= today)) {
        return offlineExpired
            ? { state: 'expired', reason: 'offline', ...who, trialDaysLeft: 0, maxServers: 0 }
            : { state: 'licensed', ...who, trialDaysLeft: 0, maxServers: licence.servers ?? null };
    }

    if (licence) {
        return { state: 'expired', reason: 'licence', ...who, trialDaysLeft: 0, maxServers: 0 };
    }

    if (revoked) {
        return { state: 'expired', reason: 'revoked', ...who, trialDaysLeft: 0, maxServers: 0 };
    }

    const started = trialStartedAt ? new Date(trialStartedAt).getTime() : now.getTime();
    const daysLeft = Math.max(0, Math.ceil((started + trialDays * DAY - now.getTime()) / DAY));

    return daysLeft > 0
        ? { state: 'trial', trialDaysLeft: daysLeft, ...who, maxServers: TRIAL_SERVERS }
        : { state: 'expired', reason: 'trial', trialDaysLeft: 0, ...who, maxServers: 0 };
}

/**
 * Which saved servers the plan locks: real servers in their saved order,
 * the first `maxServers` stay usable and the rest are locked (never
 * deleted). The demo server never counts. null means no limit.
 *
 * @param {{ id: string, demo?: boolean }[]} servers in the order servers.json keeps them
 * @param {number | null} maxServers
 * @returns {Set<string>}
 */
export function lockedServerIds(servers, maxServers) {
    if (maxServers === null || maxServers === undefined) {
        return new Set();
    }

    return new Set(
        servers
            .filter((server) => !server.demo)
            .slice(Math.max(0, maxServers))
            .map((server) => server.id),
    );
}

/**
 * Whether one more real server fits the plan.
 *
 * @param {{ demo?: boolean }[]} servers
 * @param {number | null} maxServers
 */
export function canAddServer(servers, maxServers) {
    return maxServers === null || maxServers === undefined || servers.filter((server) => !server.demo).length < maxServers;
}

/** "basic" → "Basic". */
export const planName = (plan) => (plan ? `${plan[0].toUpperCase()}${plan.slice(1)}` : '');

/**
 * Why a server beyond the plan's limit is locked, or why another cannot be
 * added. The window words it the same way (src/lib/licence.ts).
 *
 * @param {{ state: string, plan: string | null, maxServers: number | null }} status
 * @param {'use' | 'add'} [action]
 */
export function planLimitMessage(status, action = 'use') {
    const count = `${status.maxServers} ${status.maxServers === 1 ? 'server' : 'servers'}`;
    const covers = status.state === 'trial' ? `The free trial covers ${count}.` : status.plan ? `Your ${planName(status.plan)} plan covers ${count}.` : `Your plan covers ${count}.`;

    return action === 'add' ? `${covers} Upgrade to add another, or remove a server first.` : `${covers} Upgrade to use this one, or remove another server.`;
}
