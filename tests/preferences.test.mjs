import assert from 'node:assert/strict';
import { test } from 'node:test';
import { change, resolve } from '../electron/preferences.mjs';

test('a fresh install starts on Midnight with gold', () => {
    const preferences = resolve({});

    assert.equal(preferences.theme, 'midnight');
    assert.equal(preferences.accent, 'gold');
});

test('a theme saved by 0.1.0 without being picked falls back to the default', () => {
    const preferences = resolve({ theme: 'carbon', accent: 'signal-red', lastServerId: 'abc', refreshSeconds: 8 });

    assert.equal(preferences.theme, 'midnight');
    assert.equal(preferences.accent, 'gold');
    assert.equal(preferences.lastServerId, 'abc');
    assert.equal(preferences.refreshSeconds, 8);
});

test('a theme someone picked is kept', () => {
    const { toStore, preferences } = change({}, { theme: 'olive-drab' });

    assert.equal(preferences.theme, 'olive-drab');
    assert.equal(toStore.appearanceChosen, true);
    assert.equal(resolve(toStore).theme, 'olive-drab');
});

test('only what was set is stored', () => {
    const { toStore } = change({ theme: 'carbon', accent: 'signal-red' }, { lastServerId: 'xyz' });

    assert.deepEqual(toStore, { lastServerId: 'xyz', layoutVersion: 2 });
});

test('values are kept to their shapes', () => {
    const preferences = resolve({ refreshSeconds: 999, zoom: 1.3, layoutVersion: 2, watchlist: [{ steamId: '123' }, { steamId: '76561198000000001', name: ' Ace ' }] });

    assert.equal(preferences.refreshSeconds, 60);
    assert.equal(preferences.zoom, 1.25);
    assert.equal(preferences.watchlist.length, 1);
    assert.equal(preferences.watchlist[0].name, 'Ace');
});

test('zoom saved for the old, smaller layout starts over', () => {
    assert.equal(resolve({ zoom: 1.1 }).zoom, 1);
    assert.equal(resolve({ zoom: 1.1, layoutVersion: 2 }).zoom, 1.1);
    assert.equal(change({ zoom: 1.1 }, { lastServerId: 'a' }).toStore.layoutVersion, 2);
});
