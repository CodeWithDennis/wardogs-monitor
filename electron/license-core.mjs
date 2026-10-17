import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

/**
 * Licence keys, checked offline. A key is the licence itself (who it is
 * for, the plan, when it ends) signed with the seller's Ed25519 private
 * key; the app holds only the public key, so it can tell a real key from a
 * made-up one but can never make one. Keys look like
 * PREFIX-<licence>.<signature>, both base64url.
 *
 * No Electron and no files here, so it can be tested on its own.
 */

/**
 * @typedef {{ v: 1, id: string, name: string, email: string, plan: string, issued: string, expires: string | null }} Licence
 */

const DAY = 86_400_000;

/** @param {string} pem */
export function keyFromPem(pem, kind) {
    return kind === 'private' ? createPrivateKey(pem) : createPublicKey(pem);
}

/**
 * Make a key for someone (the seller's side, see scripts/license).
 *
 * @param {{ name: string, email: string, plan?: string, days?: number | null }} who
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
        issued: now.toISOString().slice(0, 10),
        expires: who.days ? new Date(now.getTime() + who.days * DAY).toISOString().slice(0, 10) : null,
    };

    const body = Buffer.from(JSON.stringify(licence)).toString('base64url');
    const signature = sign(null, Buffer.from(body), keyFromPem(privatePem, 'private')).toString('base64url');

    return `${prefix}-${body}.${signature}`;
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
    const clean = String(key ?? '').replace(/\s+/g, '');
    const match = clean.match(new RegExp(`^${prefix}-([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`));

    if (!match) {
        return { ok: false, error: `That is not a licence key. Keys start with ${prefix}- and are pasted in one piece.` };
    }

    const [, body, signature] = match;
    let genuine = false;

    try {
        genuine = verify(null, Buffer.from(body), keyFromPem(publicPem, 'public'), Buffer.from(signature, 'base64url'));
    } catch {
        genuine = false;
    }

    if (!genuine) {
        return { ok: false, error: 'This licence key is not valid. Check that it was copied completely.' };
    }

    try {
        const licence = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

        return licence?.v === 1 ? { ok: true, licence } : { ok: false, error: 'This licence key is for a newer version of the app.' };
    } catch {
        return { ok: false, error: 'This licence key is not valid.' };
    }
}

/**
 * Where the app stands: licensed, in its trial, or locked.
 *
 * @param {{ licence: Licence | null, trialStartedAt: string | null, trialDays: number, now?: Date }} input
 */
export function licenceStatus({ licence, trialStartedAt, trialDays, now = new Date() }) {
    const today = now.toISOString().slice(0, 10);

    if (licence && (!licence.expires || licence.expires >= today)) {
        return { state: 'licensed', licensee: licence.name, email: licence.email, plan: licence.plan, expires: licence.expires, trialDaysLeft: 0 };
    }

    const started = trialStartedAt ? new Date(trialStartedAt).getTime() : now.getTime();
    const daysLeft = Math.max(0, Math.ceil((started + trialDays * DAY - now.getTime()) / DAY));

    if (licence) {
        return { state: 'expired', reason: 'licence', licensee: licence.name, email: licence.email, plan: licence.plan, expires: licence.expires, trialDaysLeft: 0 };
    }

    return daysLeft > 0
        ? { state: 'trial', trialDaysLeft: daysLeft, licensee: null, email: null, plan: null, expires: null }
        : { state: 'expired', reason: 'trial', trialDaysLeft: 0, licensee: null, email: null, plan: null, expires: null };
}
