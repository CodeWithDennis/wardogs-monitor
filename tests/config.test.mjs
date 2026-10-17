import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { rotationValues, settingsValues, validateRotation, validateSettings, WardogsConfig, writeField } from '../electron/config.mjs';

const fixture = readFileSync(new URL('../mock/server-settings.ini', import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n');

test('reads the settings the forms show', () => {
    const values = settingsValues(WardogsConfig.parse(fixture));

    assert.equal(values.max_players, 100);
    assert.equal(values.score_period, 18);
    assert.equal(values.lock_overpopulated_teams, true);
    assert.equal(values.image_url, 'https://example.com/server-banner.png');
    assert.deepEqual(values.reserved_steam_ids, ['00000000000000000']);
});

test('reads the rotation entries', () => {
    const rotation = rotationValues(WardogsConfig.parse(fixture));

    assert.equal(rotation.enabled, true);
    assert.equal(rotation.mode, 'Random');
    assert.deepEqual(rotation.entries[0], { map: 'Kavkazi', experiences: ['Bakurani_KOTH_01', 'KOTH_InfantryOnly'], lighting: 'DayStartClear', zone: null });
});

test('changes only the edited line and keeps Windows line endings', () => {
    const config = WardogsConfig.parse(fixture);
    writeField(config, 'score_period', 24);
    const after = config.toString();

    assert.ok(after.includes('ScorePeriod=24\r\n'));
    assert.equal(after.split('\r\n').length, fixture.split('\r\n').length);
    assert.equal(after.replace('ScorePeriod=24', 'ScorePeriod=18'), fixture);
});

test('never touches the RCON section', () => {
    const config = WardogsConfig.parse(fixture);
    writeField(config, 'server_password', 'letmein');
    config.setRotationEntries([{ map: 'Europe', experiences: ['Madrid_KOTH_01'], lighting: null, zone: null }]);

    assert.ok(config.toString().includes('[/Script/WDRCON.WDRCONSettings]\r\nbEnabled=true\r\nPassword=rcon-secret'));
});

test('writes a single experience with the singular key', () => {
    const config = WardogsConfig.parse(fixture);
    config.setRotationEntries([{ map: 'Europe', experiences: ['Madrid_KOTH_01'], lighting: 'DayClear', zone: 'ZoneAlternator.Ozeti.Church.Circle' }]);

    assert.ok(config.toString().includes('!RotationEntries=ClearArray\r\n.RotationEntries=(Map="Europe",Experience="Madrid_KOTH_01",Lighting="DayClear",ZoneAlternator="ZoneAlternator.Ozeti.Church.Circle")\r\n'));
    assert.equal(rotationValues(config).entries.length, 1);
});

test('adds a missing key to the end of its section, and a missing section to the end', () => {
    const config = WardogsConfig.parse('[A]\nOne=1\n\n[B]\nTwo=2');
    config.set('A', 'Three', '3');
    config.set('C', 'Four', '4');

    assert.equal(config.toString(), '[A]\nOne=1\nThree=3\n\n[B]\nTwo=2\n\n[C]\nFour=4\n');
});

test('refuses settings outside the Wardogs limits', () => {
    const errors = validateSettings({ max_players: 120, score_period: 10, server_password: 'has space', reserved_steam_ids: ['123'], image_url: 'http://x' });

    assert.deepEqual(Object.keys(errors).sort(), ['image_url', 'max_players', 'reserved_steam_ids', 'score_period', 'server_password']);
    assert.deepEqual(validateSettings({ max_players: 80, score_period: 20, server_password: '', reserved_steam_ids: [] }), {});
});

test('refuses a rotation that is on but empty', () => {
    assert.match(validateRotation({ enabled: true, mode: 'Ordered', entries: [] }), /at least one/);
    assert.equal(validateRotation({ enabled: false, mode: 'Random', entries: [] }), null);
});
