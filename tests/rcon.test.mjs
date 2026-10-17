import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startMockServer } from '../mock/wardogs-mock.mjs';
import { rcon, RconError } from '../electron/rcon.mjs';

let mock;
let target;

before(async () => {
    mock = await startMockServer({ port: 0, password: 'secret', quiet: true });
    target = { host: '127.0.0.1', port: mock.port, password: 'secret' };
});

after(() => mock.close());

test('reads status, players and health', async () => {
    const [status, players, health] = await Promise.all([rcon.status(target), rcon.players(target), rcon.health(target)]);

    assert.equal(status.map, 'Ozeti');
    assert.equal(status.factionScores.length, 2);
    assert.equal(players.length, status.players.current);
    assert.equal(health.status, 'ok');
});

test('a wrong password is reported as such', async () => {
    await assert.rejects(rcon.status({ ...target, password: 'nope' }), (error) => error instanceof RconError && error.wrongPassword);
});

test('a server that is not there is reported as unreachable', async () => {
    await assert.rejects(rcon.status({ ...target, port: 1 }), (error) => error instanceof RconError && error.unreachable);
});

test('kicks and bans a player', async () => {
    const [first, second] = await rcon.players(target);

    await rcon.kick(target, first.steamId, 'Team killing');
    await rcon.ban(target, second.steamId, 'Cheating');

    const players = await rcon.players(target);
    assert.ok(!players.some((player) => [first.steamId, second.steamId].includes(player.steamId)));
    assert.ok((await rcon.bans(target)).some((ban) => ban.steamId === second.steamId && ban.reason === 'Cheating'));

    await rcon.unban(target, second.steamId);
    assert.ok(!(await rcon.bans(target)).some((ban) => ban.steamId === second.steamId));
});

test('an error the server explains is passed on', async () => {
    await assert.rejects(rcon.kick(target, '76561190000000000', 'gone'), /not on the server/);
});

test('saving a stale config is refused', async () => {
    const { text, revision } = await rcon.config(target);

    await rcon.putConfig(target, text.replace('ScorePeriod=18', 'ScorePeriod=20'), revision);
    await assert.rejects(rcon.putConfig(target, text, revision), (error) => error instanceof RconError && error.configChanged);
});

test('changing the map travels there', async () => {
    await rcon.changeMap(target, { map: 'Kavkazi', experiences: ['Bakurani_KOTH_01'], lighting: 'DayClear' });

    const status = await rcon.status(target);
    assert.equal(status.map, 'Bakurani');
    assert.equal(status.lighting, 'DayClear');
});
