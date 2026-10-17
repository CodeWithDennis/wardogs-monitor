import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { canAddServer, issueKey, licenceStatus, lockedServerIds, planLimitMessage, readKey, signPayload } from '../electron/license-core.mjs';

const pair = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');

    return { publicPem: publicKey.export({ type: 'spki', format: 'pem' }), privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
};

const seller = pair();

test('a key made with the private key is accepted', () => {
    const key = issueKey({ name: 'Jane Doe', email: 'jane@example.com', plan: 'pro' }, seller.privatePem, 'TEST');
    const read = readKey(key, seller.publicPem, 'TEST');

    assert.equal(read.ok, true);
    assert.equal(read.licence.name, 'Jane Doe');
    assert.equal(read.licence.plan, 'pro');
    assert.equal(read.licence.expires, null);
});

test('a key survives line breaks from copying', () => {
    const key = issueKey({ name: 'Jane', email: 'j@example.com' }, seller.privatePem, 'TEST');

    assert.equal(readKey(`  ${key.slice(0, 20)}\n${key.slice(20)} `, seller.publicPem, 'TEST').ok, true);
});

test('a key signed by someone else is refused', () => {
    const forger = pair();
    const key = issueKey({ name: 'Mallory', email: 'm@example.com' }, forger.privatePem, 'TEST');

    assert.equal(readKey(key, seller.publicPem, 'TEST').ok, false);
});

test('a key whose licence was edited is refused', () => {
    const key = issueKey({ name: 'Jane', email: 'j@example.com', days: 30 }, seller.privatePem, 'TEST');
    const [prefixed, signature] = key.split('.');
    const licence = JSON.parse(Buffer.from(prefixed.slice(5), 'base64url').toString());
    const edited = `TEST-${Buffer.from(JSON.stringify({ ...licence, expires: null })).toString('base64url')}.${signature}`;

    assert.equal(readKey(edited, seller.publicPem, 'TEST').ok, false);
});

test('rubbish is refused with a readable reason', () => {
    const read = readKey('hello', seller.publicPem, 'TEST');

    assert.equal(read.ok, false);
    assert.match(read.error, /TEST-/);
});

test('the trial counts down, then locks', () => {
    const start = new Date('2026-10-01T12:00:00Z');

    assert.deepEqual(licenceStatus({ licence: null, trialStartedAt: start.toISOString(), trialDays: 14, now: new Date('2026-10-05T12:00:00Z') }).trialDaysLeft, 10);
    assert.equal(licenceStatus({ licence: null, trialStartedAt: start.toISOString(), trialDays: 14, now: new Date('2026-10-20T12:00:00Z') }).state, 'expired');
});

test('a licence unlocks, until it ends', () => {
    const licence = { v: 1, id: 'x', name: 'Jane', email: 'j@example.com', plan: 'standard', issued: '2026-01-01', expires: '2026-12-31' };

    assert.equal(licenceStatus({ licence, trialStartedAt: '2020-01-01', trialDays: 14, now: new Date('2026-06-01') }).state, 'licensed');
    assert.equal(licenceStatus({ licence, trialStartedAt: '2020-01-01', trialDays: 14, now: new Date('2027-01-02') }).state, 'expired');
});

test('a key carries the plan\'s server limit; older keys without it are unlimited', () => {
    const limited = readKey(issueKey({ name: 'Jane', email: 'j@example.com', plan: 'basic', servers: 3 }, seller.privatePem, 'TEST'), seller.publicPem, 'TEST');
    const unlimited = readKey(issueKey({ name: 'Jane', email: 'j@example.com', plan: 'alliance', servers: null }, seller.privatePem, 'TEST'), seller.publicPem, 'TEST');
    const legacy = readKey(
        signPayload({ v: 1, id: 'old', name: 'Jane', email: 'j@example.com', plan: 'standard', issued: '2026-01-01', expires: null }, seller.privatePem, 'TEST'),
        seller.publicPem,
        'TEST',
    );

    assert.equal(limited.licence.servers, 3);
    assert.equal(unlimited.licence.servers, null);
    assert.equal(legacy.ok, true);
    assert.equal(legacy.licence.servers, null);
});

test('maxServers follows the state: 10 in the trial, the plan when licensed, 0 when locked', () => {
    const basic = { v: 1, id: 'x', name: 'Jane', email: 'j@example.com', plan: 'basic', servers: 3, issued: '2026-01-01', expires: '2026-12-31' };
    const at = (licence, now, extra = {}) => licenceStatus({ licence, trialStartedAt: '2026-10-01T12:00:00Z', trialDays: 14, now: new Date(now), ...extra });

    assert.equal(at(null, '2026-10-05T12:00:00Z').maxServers, 10);
    assert.equal(at(null, '2026-10-20T12:00:00Z').maxServers, 0);
    assert.equal(at(basic, '2026-11-01').maxServers, 3);
    assert.equal(at({ ...basic, servers: null }, '2026-11-01').maxServers, null);
    assert.equal(at(basic, '2027-01-02').maxServers, 0);
});

test('a revoked licence locks even during the trial; an offline grace that ran out locks too', () => {
    const basic = { v: 1, id: 'x', name: 'Jane', email: 'j@example.com', plan: 'basic', servers: 3, issued: '2026-01-01', expires: null };
    const revoked = licenceStatus({ licence: null, trialStartedAt: '2026-10-01T12:00:00Z', trialDays: 14, now: new Date('2026-10-05T12:00:00Z'), revoked: true });
    const offline = licenceStatus({ licence: basic, trialStartedAt: '2020-01-01', trialDays: 14, offlineExpired: true });

    assert.deepEqual([revoked.state, revoked.reason, revoked.maxServers], ['expired', 'revoked', 0]);
    assert.deepEqual([offline.state, offline.reason, offline.maxServers], ['expired', 'offline', 0]);
});

test('servers beyond the limit are locked in saved order; the demo server never counts', () => {
    const saved = [{ id: 'a' }, { id: 'demo', demo: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

    assert.deepEqual([...lockedServerIds(saved, 2)], ['c', 'd']);
    assert.deepEqual([...lockedServerIds(saved, 4)], []);
    assert.deepEqual([...lockedServerIds(saved, null)], []);
    assert.deepEqual([...lockedServerIds(saved, 0)], ['a', 'b', 'c', 'd']);
});

test('a new server is refused once the plan is full', () => {
    const saved = [{ id: 'a' }, { id: 'b' }, { id: 'demo', demo: true }];

    assert.equal(canAddServer(saved, 3), true);
    assert.equal(canAddServer([...saved, { id: 'c' }], 3), false);
    assert.equal(canAddServer([...saved, { id: 'c' }], null), true);
});

test('the limit message names the plan and the number of servers', () => {
    assert.equal(planLimitMessage({ state: 'licensed', plan: 'basic', maxServers: 3 }), 'Your Basic plan covers 3 servers. Upgrade to use this one, or remove another server.');
    assert.match(planLimitMessage({ state: 'trial', plan: null, maxServers: 10 }, 'add'), /^The free trial covers 10 servers\. Upgrade to add another/);
});
