import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSummary, serverLabel, statusLine, tooltip } from '../electron/tray-status.mjs';

const summary = cleanSummary({
    selectedId: 'a',
    servers: [
        { id: 'a', name: 'Alpha', state: 'online', players: 60, maxPlayers: 64 },
        { id: 'b', name: 'Bravo', state: 'online', players: 32, maxPlayers: 64 },
        { id: 'c', name: 'Charlie', state: 'offline', players: 0, maxPlayers: 0 },
    ],
});

test('the tooltip counts servers online and their players', () => {
    assert.equal(tooltip('Wardogs Monitor', summary), 'Wardogs Monitor · 2 of 3 servers online · 92 players');
});

test('the status line before the first summary, with no servers, and for one', () => {
    assert.equal(statusLine(null), 'Starting…');
    assert.equal(statusLine(cleanSummary({ servers: [] })), 'No servers added yet');
    assert.equal(statusLine(cleanSummary({ servers: [{ id: 'a', name: 'A', state: 'online', players: 1, maxPlayers: 8 }] })), '1 of 1 server online · 1 player');
});

test('a summary from the window is kept to its shape', () => {
    const clean = cleanSummary({ selectedId: 7, servers: [{ id: 'x', name: '  ', state: 'exploded', players: -4, maxPlayers: '64' }, { name: 'no id' }] });

    assert.equal(clean.selectedId, null);
    assert.deepEqual(clean.servers, [{ id: 'x', name: 'Server', state: 'unknown', players: 0, maxPlayers: 64 }]);
    assert.deepEqual(cleanSummary(undefined), { selectedId: null, servers: [] });
});

test('a server in the menu says how it is doing, with & kept literal', () => {
    assert.equal(serverLabel(summary.servers[0]), 'Alpha  ·  60/64 players');
    assert.equal(serverLabel(summary.servers[2]), 'Charlie  ·  offline');
    assert.equal(serverLabel({ id: 'd', name: 'Rock & Roll', state: 'locked', players: 0, maxPlayers: 0 }), 'Rock && Roll  ·  locked');
});

test('the tooltip never passes the 127 characters Windows allows', () => {
    assert.ok(tooltip('W'.repeat(200), summary).length <= 127);
});
