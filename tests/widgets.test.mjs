import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from '../electron/preferences.mjs';
import { cleanWidgets, MAX_WIDGETS, onScreen, placeWidget, WIDGET_KINDS } from '../electron/widgets.mjs';

const area = { x: 0, y: 0, width: 1920, height: 1040 };

test('stored widgets keep known kinds, one per kind and server', () => {
    const widgets = cleanWidgets([
        { id: 'a', kind: 'score', serverId: 's1', bounds: { x: 10.4, y: 20, width: 380, height: 300 } },
        { id: 'b', kind: 'score', serverId: 's1', bounds: null },
        { id: 'c', kind: 'score', serverId: 's2' },
        { id: 'd', kind: 'radar', serverId: 's1' },
        { id: 'a', kind: 'players', serverId: 's1' },
        { kind: 'status', serverId: 's1' },
        { id: 'e', kind: 'actions', serverId: 's1', bounds: { x: 'left', y: 0, width: 300, height: 260 } },
    ]);

    assert.deepEqual(widgets, [
        { id: 'a', kind: 'score', serverId: 's1', bounds: { x: 10, y: 20, width: 380, height: 300 } },
        { id: 'c', kind: 'score', serverId: 's2', bounds: null },
        { id: 'e', kind: 'actions', serverId: 's1', bounds: null },
    ]);
});

test('no more widgets are kept than can be open', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ id: `w${index}`, kind: 'status', serverId: `s${index}` }));

    assert.equal(cleanWidgets(many).length, MAX_WIDGETS);
    assert.deepEqual(cleanWidgets('nonsense'), []);
});

test('preferences start with no widgets and keep a valid list', () => {
    assert.deepEqual(resolve({}).widgets, []);
    assert.deepEqual(resolve({ widgets: [{ id: 'a', kind: 'players', serverId: 's1' }] }).widgets, [{ id: 'a', kind: 'players', serverId: 's1', bounds: null }]);
});

test('a new widget opens at the top right of the screen', () => {
    const first = placeWidget('score', area, []);

    assert.equal(first.width, WIDGET_KINDS.score.size.width);
    assert.equal(first.x + first.width, 1900);
    assert.equal(first.y, 80);
});

test('new widgets never open on top of open ones', () => {
    const taken = [];

    for (const kind of ['status', 'score', 'players', 'actions', 'status', 'score']) {
        const spot = placeWidget(kind, area, taken);
        const clash = taken.some((other) => spot.x < other.x + other.width && other.x < spot.x + spot.width && spot.y < other.y + other.height && other.y < spot.y + spot.height);

        assert.equal(clash, false, `${kind} overlaps an open widget`);
        assert.ok(spot.x >= area.x && spot.y >= area.y && spot.x + spot.width <= area.x + area.width && spot.y + spot.height <= area.y + area.height);
        taken.push(spot);
    }
});

test('a new widget never opens off a small screen', () => {
    const small = { x: 0, y: 0, width: 300, height: 200 };
    const bounds = placeWidget('players', small, [{ x: 0, y: 0, width: 300, height: 200 }]);

    assert.ok(bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.width <= 300 && bounds.height <= 200);
});

test('saved places count only while they are still on a screen', () => {
    assert.equal(onScreen({ x: 1500, y: 80, width: 380, height: 300 }, [area]), true);
    assert.equal(onScreen({ x: 2500, y: 80, width: 380, height: 300 }, [area]), false);
    assert.equal(onScreen({ x: 2500, y: 80, width: 380, height: 300 }, [area, { x: 1920, y: 0, width: 1920, height: 1040 }]), true);
    assert.equal(onScreen({ x: 100, y: -400, width: 380, height: 300 }, [area]), false);
});
