import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { issueKey, licenceStatus, readKey } from '../electron/license-core.mjs';

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
