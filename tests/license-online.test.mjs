import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { issueKey, readKey, signPayload } from '../electron/license-core.mjs';
import { activateOnline, deactivateOnline, hashDevice, statusFor, validateOnline } from '../electron/license-online.mjs';

/**
 * The online licence check against a tiny stand-in for the website's
 * licence API, on this PC only.
 */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const DEVICE = '6c3f3e0e-2a8b-4b55-9f43-1b8a3b0c9d11';
const NOW = new Date('2026-10-17T12:00:00Z');

/** @type {{ path: string, body: any }[]} */
let requests = [];
/** @type {(path: string, body: any) => { status: number, json: any }} */
let answer = () => ({ status: 500, json: {} });
let server;
let api;

before(async () => {
    server = createServer((request, response) => {
        let text = '';
        request.on('data', (chunk) => (text += chunk));
        request.on('end', () => {
            const body = JSON.parse(text || '{}');
            requests.push({ path: request.url, body });
            const { status, json } = answer(request.url, body);
            response.writeHead(status, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify(json));
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    api = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(() => server.close());

beforeEach(() => {
    requests = [];
});

const ctx = (overrides = {}) => ({ api, fetch, publicPem, keyPrefix: 'TEST', statusPrefix: 'TESTS', deviceId: DEVICE, deviceName: 'GAMING-PC', timeoutMs: 2000, now: () => NOW, ...overrides });

/** An API that cannot be reached: a port nothing listens on. */
async function deadApi() {
    const closed = createServer();
    await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address();
    await new Promise((resolve) => closed.close(resolve));

    return `http://127.0.0.1:${port}/api/v1`;
}

const keyFor = (fields = {}) => issueKey({ name: 'Jane', email: 'jane@example.com', plan: 'basic', servers: 3, days: 30, ...fields }, privatePem, 'TEST', new Date('2026-10-01T00:00:00Z'));
const idOf = (key) => readKey(key, publicPem, 'TEST').licence.id;

const token = (key, validUntil = '2026-10-24T12:00:00Z', device = DEVICE) =>
    signPayload({ v: 1, licence_id: idOf(key), device: hashDevice(device), status: 'active', checked: '2026-10-17T12:00:00Z', valid_until: validUntil }, privatePem, 'TESTS');

const active = (key, extra = {}) => ({
    status: 200,
    json: {
        status: 'active',
        licence: { id: idOf(key), name: 'Jane', email: 'jane@example.com', plan: 'basic', expires: '2026-10-31', max_activations: 2 },
        activations: { used: 1, max: 2 },
        subscription: { status: 'active', interval: 'monthly', renews_at: '2026-11-17T00:00:00Z', cancel_at_period_end: false },
        token: token(key),
        key,
        ...extra,
    },
});

const refused = (code, status = 403) => ({ status, json: { status: code, message: `Refused: ${code}` } });

const statusOf = (saved, now = NOW) => statusFor({ saved, trialStartedAt: '2026-01-01T00:00:00Z', trialDays: 14, ctx: ctx(), now });

test('activating stores the token and subscription, and sends only the key, the device ID and its name', async () => {
    const key = keyFor();
    answer = () => active(key);

    const result = await activateOnline(key, ctx());

    assert.equal(result.ok, true);
    assert.deepEqual(requests, [{ path: '/api/v1/licenses/activate', body: { key, device_id: DEVICE, device_name: 'GAMING-PC' } }]);
    assert.equal(result.record.onlineConfirmed, true);
    assert.equal(result.record.token, token(key));
    assert.deepEqual(result.record.seats, { used: 1, max: 2 });

    const status = statusOf(result.record);
    assert.equal(status.state, 'licensed');
    assert.equal(status.maxServers, 3);
    assert.equal(status.subscription.renews_at, '2026-11-17T00:00:00Z');
    assert.equal(status.lastCheckedAt, NOW.toISOString());
});

test('a clear refusal stops the activation with the website\'s reason', async () => {
    answer = () => refused('limit_reached');

    const result = await activateOnline(keyFor(), ctx());

    assert.equal(result.ok, false);
    assert.match(result.error, /maximum number of PCs/);
});

test('when the website cannot be reached, the key is activated offline and not yet confirmed', async () => {
    const result = await activateOnline(keyFor(), ctx({ api: await deadApi() }));

    assert.equal(result.ok, true);
    assert.equal(result.record.onlineConfirmed, false);
    assert.equal(statusOf(result.record).state, 'licensed');
    assert.equal(statusOf(result.record).onlineConfirmed, false);
});

test('a check swaps in the renewed key, which can raise the server limit', async () => {
    const key = keyFor();
    const upgraded = signPayload({ ...readKey(key, publicPem, 'TEST').licence, plan: 'community', servers: 10, expires: '2026-12-31' }, privatePem, 'TEST');
    answer = () => active(upgraded);

    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), onlineConfirmed: true }, ctx());

    assert.deepEqual(requests, [{ path: '/api/v1/licenses/validate', body: { key, device_id: DEVICE } }]);
    assert.equal(result.record.key, upgraded);
    assert.equal(statusOf(result.record).maxServers, 10);
    assert.equal(statusOf(result.record).plan, 'community');
});

test('a key for another licence is never swapped in', async () => {
    const key = keyFor();
    const other = keyFor({ servers: null });
    answer = () => active(other);

    const result = await validateOnline({ key, activatedAt: NOW.toISOString() }, ctx());

    assert.equal(result.record.key, key);
});

test('a revoked licence is removed and locks the app', async () => {
    answer = () => refused('revoked');

    const result = await validateOnline({ key: keyFor(), activatedAt: NOW.toISOString(), token: null }, ctx());

    assert.deepEqual(result, { revoked: true });

    const status = statusOf({ revoked: true });
    assert.deepEqual([status.state, status.reason, status.maxServers], ['expired', 'revoked', 0]);
});

test('an expired answer keeps the key, so the status follows its own expiry', async () => {
    const key = keyFor();
    answer = () => refused('expired');

    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), token: token(key) }, ctx());

    assert.equal(result.record.key, key);
    assert.equal(result.record.token, null);
    assert.equal(statusOf(result.record).state, 'licensed');
    assert.equal(statusOf(result.record, new Date('2026-11-15T00:00:00Z')).reason, 'licence');
});

test('a PC the website does not know yet is activated once', async () => {
    const key = keyFor();
    answer = (path) => (path.endsWith('/validate') ? refused('not_activated') : active(key));

    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), onlineConfirmed: false }, ctx());

    assert.deepEqual(
        requests.map((request) => request.path),
        ['/api/v1/licenses/validate', '/api/v1/licenses/activate'],
    );
    assert.equal(result.record.onlineConfirmed, true);
});

test('unreachable with a token that is still valid: keeps working', async () => {
    const key = keyFor();
    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-20T00:00:00Z'), onlineConfirmed: true }, ctx({ api: await deadApi() }));

    assert.equal(result.record.lastFailedAt, NOW.toISOString());
    assert.equal(statusOf(result.record).state, 'licensed');
});

test('unreachable after the token ran out: locks until the website answers again', async () => {
    const key = keyFor();
    answer = () => ({ status: 503, json: {} });

    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-16T00:00:00Z'), onlineConfirmed: true }, ctx());
    const status = statusOf(result.record);

    assert.deepEqual([status.state, status.reason, status.maxServers], ['expired', 'offline', 0]);

    // The token ran out but nothing has tried since: not locked yet.
    assert.equal(statusOf({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-16T00:00:00Z') }).state, 'licensed');
});

test('a token for another PC is ignored; the key alone counts', async () => {
    const key = keyFor();
    const record = { key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-01T00:00:00Z', 'another-pc'), lastFailedAt: NOW.toISOString() };

    assert.equal(statusOf(record).state, 'licensed');
});

test('deactivating frees the seat, best effort', async () => {
    const key = keyFor();
    answer = () => ({ status: 200, json: { status: 'deactivated', activations: { used: 0, max: 2 } } });

    assert.equal(await deactivateOnline(key, ctx()), true);
    assert.deepEqual(requests, [{ path: '/api/v1/licenses/deactivate', body: { key, device_id: DEVICE } }]);
    assert.equal(await deactivateOnline(key, ctx({ api: await deadApi() })), false);
});
