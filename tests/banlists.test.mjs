import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startMockServer } from '../mock/wardogs-mock.mjs';
import { afterSync, applyPlan, dropServer, planSync, readGroups, recordBan, recordUnban, saveGroup } from '../electron/banlists.mjs';
import { rcon, RconError } from '../electron/rcon.mjs';

const A = '76561198000000101';
const B = '76561198000000102';
const C = '76561198000000103';

const group = (changes = {}) => ({ id: 'g1', name: 'Global bans', serverIds: ['s1', 's2', 's3'], bans: [], tombstones: [], createdAt: '2026-10-01T00:00:00.000Z', lastSyncedAt: null, ...changes });
const ban = (steamId, bannedAt = '2026-10-10T10:00:00.000Z', reason = 'Cheating') => ({ steamId, bannedAt, bannedBy: 'rcon', reason });
const reading = (serverId, bans) => ({ serverId, serverName: serverId.toUpperCase(), bans });
const ids = (list) => list.map((entry) => entry.steamId).sort();

describe('planning a sync', () => {
    test('every server gets the bans the others have', () => {
        const plan = planSync(group(), [reading('s1', [ban(A)]), reading('s2', [ban(B)]), reading('s3', [ban(A), ban(B)])]);

        assert.deepEqual(ids(plan.shared), [A, B]);
        assert.deepEqual(ids(plan.servers[0].toAdd), [B]);
        assert.deepEqual(ids(plan.servers[1].toAdd), [A]);
        assert.deepEqual(plan.servers[2].toAdd, []);
        assert.equal(plan.missing, 2);
        assert.equal(plan.serversBehind, 2);
    });

    test('bans the group already knows are part of the shared list', () => {
        const plan = planSync(group({ bans: [ban(C, '2026-10-01T00:00:00.000Z', 'Hate speech')] }), [reading('s1', [ban(A)]), reading('s2', [ban(A)])]);

        assert.deepEqual(ids(plan.shared), [A, C]);
        assert.equal(plan.servers[0].toAdd.find((entry) => entry.steamId === C).reason, 'Hate speech');
    });

    test('a server that could not be read is skipped, never taken to have no bans', () => {
        const plan = planSync(group(), [reading('s1', [ban(A)]), { serverId: 's2', serverName: 'S2', skipped: 'The server did not answer.' }, reading('s3', [])]);

        assert.deepEqual(plan.skipped, [{ serverId: 's2', serverName: 'S2', reason: 'The server did not answer.' }]);
        assert.deepEqual(plan.servers.map((server) => server.serverId), ['s1', 's3']);
        assert.deepEqual(ids(plan.servers[1].toAdd), [A]);
    });

    test('a tombstone lifts an older ban everywhere and keeps it from spreading', () => {
        const plan = planSync(group({ tombstones: [{ steamId: A, removedAt: '2026-10-12T00:00:00.000Z' }] }), [reading('s1', []), reading('s2', [ban(A)]), reading('s3', [ban(A), ban(B)])]);

        assert.deepEqual(ids(plan.shared), [B]);
        assert.deepEqual(ids(plan.servers[0].toAdd), [B]);
        assert.deepEqual(ids(plan.servers[1].toRemove), [A]);
        assert.deepEqual(ids(plan.servers[2].toRemove), [A]);
        assert.equal(plan.lifting, 2);
    });

    test('an undated ban (from the server file) counts as older than a tombstone', () => {
        const plan = planSync(group({ tombstones: [{ steamId: A, removedAt: '2026-10-12T00:00:00.000Z' }] }), [reading('s1', [ban(A, null)]), reading('s2', [])]);

        assert.deepEqual(ids(plan.servers[0].toRemove), [A]);
        assert.deepEqual(plan.shared, []);
    });

    test('a ban newer than its tombstone brings it back', () => {
        const plan = planSync(group({ tombstones: [{ steamId: A, removedAt: '2026-10-12T00:00:00.000Z' }] }), [reading('s1', [ban(A, '2026-10-13T00:00:00.000Z')]), reading('s2', [])]);

        assert.deepEqual(ids(plan.shared), [A]);
        assert.deepEqual(ids(plan.servers[1].toAdd), [A]);
        assert.deepEqual(plan.servers[0].toRemove, []);
        assert.deepEqual(plan.tombstones, []);
    });

    test('the original ban keeps its reason and source', () => {
        const plan = planSync(group(), [reading('s1', [ban(A, '2026-10-12T00:00:00.000Z', 'Copied')]), reading('s2', [ban(A, '2026-10-01T00:00:00.000Z', 'Aimbot')]), reading('s3', [])]);

        assert.equal(plan.servers[2].toAdd[0].reason, 'Aimbot');
        assert.equal(plan.servers[2].toAdd[0].sourceServerId, 's2');
    });

    test('servers that match have nothing to do, and the fingerprint follows the changes', () => {
        const same = planSync(group(), [reading('s1', [ban(A)]), reading('s2', [ban(A)])]);
        const other = planSync(group(), [reading('s1', [ban(A)]), reading('s2', [])]);

        assert.equal(same.missing + same.lifting, 0);
        assert.notEqual(same.fingerprint, other.fingerprint);
        assert.equal(other.fingerprint, planSync(group(), [reading('s2', []), reading('s1', [ban(A)])]).fingerprint);
    });
});

describe('groups', () => {
    const saved = [
        { id: 's1', name: 'EU 1' },
        { id: 's2', name: 'EU 2' },
        { id: 's3', name: 'US 1' },
    ];

    test('a server can be in one group only', () => {
        const first = saveGroup([], { name: 'Global bans', serverIds: ['s1', 's2'] }, saved);
        const second = saveGroup(first.groups, { name: 'US bans', serverIds: ['s2', 's3'] }, saved);

        assert.match(second.error, /EU 2 is already linked to “Global bans”/);
    });

    test('names must be given and different', () => {
        assert.ok(saveGroup([], { name: '  ' }, saved).error);
        assert.ok(saveGroup(saveGroup([], { name: 'Global bans' }, saved).groups, { name: 'global BANS' }, saved).error);
    });

    test('renaming keeps the servers and bans', () => {
        const { groups, group: created } = saveGroup([], { name: 'Global bans', serverIds: ['s1'] }, saved);
        const renamed = saveGroup(recordBan(groups, 's1', { steamId: A, reason: 'x' }).groups, { id: created.id, name: 'All servers' }, saved);

        assert.equal(renamed.group.name, 'All servers');
        assert.deepEqual(renamed.group.serverIds, ['s1']);
        assert.deepEqual(ids(renamed.group.bans), [A]);
    });

    test('unknown servers are refused, and a removed server leaves its group', () => {
        assert.ok(saveGroup([], { name: 'X', serverIds: ['nope'] }, saved).error);
        assert.deepEqual(dropServer([group()], 's2')[0].serverIds, ['s1', 's3']);
    });

    test('a hand-edited file is kept to its shapes', () => {
        const groups = readGroups({ groups: [{ id: 'a', name: '', serverIds: ['s1', 's1'], bans: [{ steamId: 'bad' }, { steamId: A, reason: 'ok' }], tombstones: [{ steamId: B }] }, { id: 'b', name: 'Two', serverIds: ['s1', 's2'] }] });

        assert.equal(groups[0].name, 'Global bans');
        assert.deepEqual(groups[0].serverIds, ['s1']);
        assert.deepEqual(ids(groups[0].bans), [A]);
        assert.deepEqual(groups[0].tombstones, []);
        assert.deepEqual(groups[1].serverIds, ['s2']);
    });
});

describe('bans and unbans through the app', () => {
    test('a ban on a linked server joins the list and beats an older tombstone', () => {
        const { group: next } = recordBan([group({ tombstones: [{ steamId: A, removedAt: '2026-10-12T00:00:00.000Z' }] })], 's2', { steamId: A, reason: 'Again' }, '2026-10-14T00:00:00.000Z');

        assert.deepEqual(ids(next.bans), [A]);
        assert.equal(next.bans[0].sourceServerId, 's2');
        assert.deepEqual(next.tombstones, []);
    });

    test('a server in no group changes nothing', () => {
        const groups = [group()];

        assert.equal(recordBan(groups, 'elsewhere', { steamId: A }).groups, groups);
        assert.equal(recordUnban(groups, 'elsewhere', A).group, null);
    });

    test('lifting everywhere leaves a tombstone the next sync acts on', () => {
        const { group: next } = recordUnban([group({ bans: [ban(A)] })], 's1', A, '2026-10-12T00:00:00.000Z');
        const plan = planSync(next, [reading('s1', []), reading('s2', [ban(A)]), reading('s3', [ban(A)])]);

        assert.deepEqual(next.bans, []);
        assert.equal(plan.lifting, 2);
        assert.equal(plan.missing, 0);
    });

    test('after a sync the group holds the shared list, and keeps what happened meanwhile', () => {
        const started = group({ bans: [ban(A)] });
        const plan = planSync(started, [reading('s1', [ban(A), ban(B)]), reading('s2', [])]);
        const meanwhile = recordBan([started], 's1', { steamId: C, reason: 'During' }, '2026-10-15T00:00:00.000Z').group;
        const synced = afterSync(meanwhile, started, plan, '2026-10-15T00:00:01.000Z');

        assert.deepEqual(ids(synced.bans), [A, B, C]);
        assert.equal(synced.lastSyncedAt, '2026-10-15T00:00:01.000Z');
    });
});

describe('writing a plan', () => {
    test('changes go out one at a time per server, and failures are reported', async () => {
        const plan = planSync(group(), [reading('s1', [ban(A), ban(B)]), reading('s2', [])]);
        const sent = [];
        const summary = await applyPlan(plan, {
            ban: async (serverId, entry) => {
                sent.push(`${serverId}+${entry.steamId}`);

                if (entry.steamId === B) {
                    throw new Error('The server refused: no');
                }
            },
            unban: async () => {},
        });

        assert.deepEqual(sent, [`s2+${A}`, `s2+${B}`]);
        assert.equal(summary.added, 1);
        assert.equal(summary.failed, 1);
        assert.equal(summary.servers[1].failures[0].steamId, B);
    });

    test('a server that stops answering is not written to again', async () => {
        const plan = planSync(group(), [reading('s1', [ban(A), ban(B), ban(C)]), reading('s2', [])]);
        let calls = 0;
        const summary = await applyPlan(plan, {
            ban: async () => {
                calls++;
                throw RconError.unreachable();
            },
            unban: async () => {},
        });

        assert.equal(calls, 1);
        assert.equal(summary.failed, 3);
    });
});

describe('syncing two real (mock) servers', () => {
    let first;
    let second;
    let targets;

    before(async () => {
        first = await startMockServer({ port: 0, password: 'one', quiet: true, bans: [{ steamId: A, reason: 'Aimbot', bannedAtUtc: '2026-10-01T00:00:00.000Z' }, { steamId: C, reason: 'Old', bannedAtUtc: '2026-10-01T00:00:00.000Z' }] });
        second = await startMockServer({ port: 0, password: 'two', quiet: true, bans: [{ steamId: B, reason: 'Team killing', bannedAtUtc: '2026-10-02T00:00:00.000Z' }] });
        targets = {
            s1: { host: '127.0.0.1', port: first.port, password: 'one' },
            s2: { host: '127.0.0.1', port: second.port, password: 'two' },
        };
    });

    after(async () => {
        await first.close();
        await second.close();
    });

    test('both servers end with the shared list, minus what was lifted', async () => {
        const linked = group({ serverIds: ['s1', 's2'], tombstones: [{ steamId: C, removedAt: '2026-10-05T00:00:00.000Z' }] });
        const read = async () => [reading('s1', await rcon.bans(targets.s1)), reading('s2', await rcon.bans(targets.s2))].map((entry) => ({ ...entry, bans: entry.bans.map((item) => ({ ...item, bannedAt: item.bannedAtUtc })) }));

        const plan = planSync(linked, await read());
        assert.deepEqual(ids(plan.servers[0].toAdd), [B]);
        assert.deepEqual(ids(plan.servers[0].toRemove), [C]);
        assert.deepEqual(ids(plan.servers[1].toAdd), [A]);

        const summary = await applyPlan(plan, {
            ban: (serverId, entry) => rcon.ban(targets[serverId], entry.steamId, entry.reason),
            unban: (serverId, steamId) => rcon.unban(targets[serverId], steamId),
        });

        assert.deepEqual({ added: summary.added, removed: summary.removed, failed: summary.failed }, { added: 2, removed: 1, failed: 0 });
        assert.deepEqual(ids(await rcon.bans(targets.s1)), [A, B]);
        assert.deepEqual(ids(await rcon.bans(targets.s2)), [A, B]);
        assert.equal((await rcon.bans(targets.s2)).find((entry) => entry.steamId === A).reason, 'Aimbot');

        const again = planSync(afterSync(linked, linked, plan), await read());
        assert.equal(again.missing + again.lifting, 0);
    });

    test('an offline server is skipped and the other is still synced', async () => {
        const offline = { serverId: 's3', serverName: 'S3', skipped: await rcon.bans({ host: '127.0.0.1', port: 1, password: 'x' }).then(() => null, (error) => error.message) };
        const plan = planSync(group({ serverIds: ['s1', 's3'], bans: [ban('76561198000000199')] }), [reading('s1', await rcon.bans(targets.s1)), offline]);

        assert.equal(plan.skipped.length, 1);
        assert.match(plan.skipped[0].reason, /did not answer/);
        assert.deepEqual(ids(plan.servers[0].toAdd), ['76561198000000199']);
    });
});
