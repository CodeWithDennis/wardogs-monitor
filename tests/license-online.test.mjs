import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import { issueKey, readKey, signPayload } from '../electron/license-core.mjs';
import { activateOnline, deactivateOnline, hashDevice, startTrialOnline, statusFor, validateOnline } from '../electron/license-online.mjs';

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

test('activating needs the website: without an answer the key is not activated', async () => {
    const result = await activateOnline(keyFor(), ctx({ api: await deadApi() }));

    assert.equal(result.ok, false);
    assert.equal(result.code, 'unreachable');
    assert.match(result.error, /activated online once/);
});

test('an answer whose token is for another PC activates nothing', async () => {
    const key = keyFor();
    answer = () => active(key, { token: token(key, '2026-10-24T12:00:00Z', 'another-pc') });

    const result = await activateOnline(key, ctx());

    assert.equal(result.ok, false);
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
    // Without the website's confirmation the key doesn't run, and after its own expiry it has ended.
    assert.deepEqual([statusOf(result.record).state, statusOf(result.record).reason], ['expired', 'unconfirmed']);
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

test('the token ran out: locks until the website answers again, failed check or not', async () => {
    const key = keyFor();
    answer = () => ({ status: 503, json: {} });

    const result = await validateOnline({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-16T00:00:00Z'), onlineConfirmed: true }, ctx());
    const status = statusOf(result.record);

    assert.deepEqual([status.state, status.reason, status.maxServers], ['expired', 'offline', 0]);

    // No failed check recorded (say, the file was edited): the signed date alone decides.
    assert.equal(statusOf({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-16T00:00:00Z') }).reason, 'offline');
});

test('a key never confirmed for this PC does not run: no token, or another PC\'s token', async () => {
    const key = keyFor();

    assert.equal(statusOf({ key, activatedAt: NOW.toISOString() }).reason, 'unconfirmed');
    assert.equal(statusOf({ key, activatedAt: NOW.toISOString(), token: token(key, '2026-10-24T12:00:00Z', 'another-pc') }).reason, 'unconfirmed');
    // A copied licence file on another PC is the same case: the token names the PC it was signed for.
    assert.equal(statusFor({ saved: { key, token: token(key) }, trialDays: 14, ctx: ctx({ deviceId: 'another-pc' }), now: NOW }).reason, 'unconfirmed');
});

test('only a test run without a website may run a key unconfirmed', () => {
    const key = keyFor();

    assert.equal(statusFor({ saved: { key }, trialDays: 14, ctx: ctx({ allowUnconfirmed: true }), now: NOW }).state, 'licensed');
});

test('a clock turned back locks: behind the website\'s time, or behind the latest time seen', () => {
    const key = keyFor();
    const record = { key, token: token(key) };

    // The token was signed at 2026-10-17T12:00Z.
    assert.equal(statusOf(record, new Date('2026-10-17T11:00:00Z')).reason, 'clock');
    assert.equal(statusOf(record, new Date('2026-10-17T11:55:00Z')).state, 'licensed');
    assert.equal(statusFor({ saved: record, trialDays: 14, ctx: ctx(), now: new Date('2026-10-18T00:00:00Z'), latestSeen: Date.parse('2026-10-22T00:00:00Z') }).reason, 'clock');
    assert.equal(statusFor({ saved: record, trialDays: 14, ctx: ctx(), now: new Date('2026-10-22T00:30:00Z'), latestSeen: Date.parse('2026-10-22T01:00:00Z') }).state, 'licensed');
});

const trialToken = (device = DEVICE, ends = '2026-10-31T12:00:00Z') =>
    signPayload({ v: 1, kind: 'trial', device: hashDevice(device), started: '2026-10-17T12:00:00Z', ends, checked: '2026-10-17T12:00:00Z' }, privatePem, 'TESTS');

test('the trial counts from the website\'s signed dates, not from anything on this PC', () => {
    const trial = (token, now = NOW, extra = {}) => statusFor({ saved: null, trialToken: token, trialStartedAt: '2020-01-01T00:00:00Z', trialDays: 14, ctx: ctx(extra), now });

    assert.deepEqual([trial(trialToken()).state, trial(trialToken()).trialDaysLeft], ['trial', 14]);
    assert.equal(trial(trialToken(), new Date('2026-11-01T00:00:00Z')).reason, 'trial');
    assert.equal(trial(null).reason, 'trial-unconfirmed');
    assert.equal(trial(trialToken('another-pc')).reason, 'trial-unconfirmed');
    assert.equal(trial(trialToken(), new Date('2026-10-17T10:00:00Z')).reason, 'clock');
    // A licence status token is no trial token.
    assert.equal(trial(token(keyFor())).reason, 'trial-unconfirmed');
    // Test runs without a website keep a local trial.
    assert.equal(statusFor({ saved: null, trialStartedAt: '2026-10-10T12:00:00Z', trialDays: 14, ctx: ctx({ allowUnconfirmed: true }), now: NOW }).trialDaysLeft, 7);
});

test('starting the trial sends only the device ID and keeps a genuine token for this PC', async () => {
    answer = (path) => (path.endsWith('/trials/start') ? { status: 200, json: { status: 'trial', token: trialToken() } } : { status: 404, json: {} });

    const result = await startTrialOnline(ctx());

    assert.deepEqual(result, { ok: true, token: trialToken() });
    assert.deepEqual(requests.map((request) => [request.path, request.body]), [['/api/v1/trials/start', { device_id: DEVICE }]]);

    answer = () => ({ status: 200, json: { status: 'trial', token: trialToken('another-pc') } });
    assert.equal((await startTrialOnline(ctx())).ok, false);
    assert.equal((await startTrialOnline(ctx({ api: await deadApi() }))).ok, false);
});

test('deactivating frees the seat, best effort', async () => {
    const key = keyFor();
    answer = () => ({ status: 200, json: { status: 'deactivated', activations: { used: 0, max: 2 } } });

    assert.equal(await deactivateOnline(key, ctx()), true);
    assert.deepEqual(requests, [{ path: '/api/v1/licenses/deactivate', body: { key, device_id: DEVICE } }]);
    assert.equal(await deactivateOnline(key, ctx({ api: await deadApi() })), false);
});
