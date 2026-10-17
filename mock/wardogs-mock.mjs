import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * A pretend Wardogs dedicated server that answers the RCON API with the
 * same shapes the real one does (taken from the website's test fakes), and
 * plays a match on its own: scores tick, players join, leave, fight and
 * lag. It lets the panel be developed and demoed without touching a live
 * server. Only ever listens on 127.0.0.1.
 *
 *   npm run mock               → http://127.0.0.1:47990/v1, password "mock-secret"
 *   node mock/wardogs-mock.mjs 47991 other-password
 *
 * Each instance keeps its own bans, so two of them on different ports make
 * two servers with different ban lists (for linked ban lists). `bans`
 * replaces the one ban every instance starts with.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

const FACTIONS = [
    { name: 'Lonestar', colorHex: '#4CB1EF' },
    { name: 'Valkyra', colorHex: '#FA503E' },
    { name: 'Manticore', colorHex: '#5CC46A' },
];

const MAPS = {
    Europe: { name: 'Ozeti', mode: 'Madrid_KOTH_01', zones: ['Default.Circle', 'River.Circle', 'Church.Circle', 'Farmland.Circle'] },
    Kavkazi: { name: 'Bakurani', mode: 'Bakurani_KOTH_01', zones: ['Default.Circle', 'Farmland.Circle', 'Quarry.Circle'] },
    NorthAmerica: { name: 'Zestafona', mode: 'Detroit_KOTH_01', zones: ['Default.Circle', 'Docks.Circle', 'Mall.Circle'] },
};

const MODIFIERS = ['KOTH_InfantryOnly', 'KOTH_Hardcore'];

const LIGHTINGS = ['DayStartClear', 'DayEarlyClear', 'DayEarlyFog', 'DayClear', 'DayLateClear', 'DayLateGray', 'DayLateGrayFog', 'DayEndClear'];

const NAMES = [
    'Ghostline', 'Rookie', 'Kestrel', 'Wolfhound', 'Nomad', 'Brick', 'Vandal', 'Saber', 'Halcyon', 'Tundra', 'Patch', 'Viper', 'Dutch', 'Echo',
    'Granite', 'Mako', 'Odin', 'Pilgrim', 'Quill', 'Ranger', 'Sable', 'Tango', 'Umbra', 'Valor', 'Warden', 'Xeno', 'Yankee', 'Zephyr', 'Atlas',
    'Bishop', 'Cobalt', 'Drifter', 'Ember', 'Falcon', 'Gunny', 'Hex', 'Iron', 'Jackal', 'Knox', 'Lynx', 'Moth', 'Nova', 'Onyx', 'Specter',
    'Raptor', 'Shade', 'Talon', 'Ursa', 'Vector', 'Wraith', 'Badger', 'Crow', 'Dagger', 'Flint', 'Grizzly', 'Hawk', 'Jinx', 'Kilo', 'Lancer',
    'Maverick', 'Ninja', 'Oak', 'Pike', 'Reaper', 'Scout', 'Thorn', 'Venom', 'Whisky', 'Ace', 'Blitz', 'Cipher', 'Dozer', 'Frost', 'Goose',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * @param {{ port?: number, password?: string, quiet?: boolean, bans?: { steamId: string, reason?: string | null, bannedAtUtc?: string }[] }} [options]
 * @returns {Promise<{ port: number, password: string, close: () => Promise<void> }>}
 */
export async function startMockServer(options = {}) {
    const password = options.password ?? 'mock-secret';
    const log = options.quiet ? () => {} : (...parts) => console.log('[mock]', ...parts);

    let configText = readFileSync(path.join(here, 'server-settings.ini'), 'utf8').replace(/\r?\n/g, '\r\n').replace('Password=rcon-secret', `Password=${password}`);
    const revisionOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);
    let steamCounter = 76561198000000001n;
    const startedAt = Date.now();

    const state = {
        map: 'Europe',
        experiences: ['Madrid_KOTH_01', 'KOTH_InfantryOnly'],
        lighting: 'DayEarlyFog',
        zone: 'ZoneAlternator.Ozeti.River.Circle',
        scores: [40, 25, 31],
        tick: 18,
        rotationIndex: 0,
        pendingMap: null,
        players: [],
        bans: options.bans
            ? options.bans.map((ban) => ({ steamId: ban.steamId, bannedAtUtc: ban.bannedAtUtc ?? new Date().toISOString(), bannedBy: 'rcon', reason: ban.reason ?? null }))
            : [{ steamId: '76561198000000002', bannedAtUtc: '2026-09-01T12:00:00.000Z', bannedBy: 'rcon', reason: 'Cheating' }],
        messages: [],
    };

    const maxPlayers = () => Number(configText.match(/^MaxPlayers=(\d+)/m)?.[1] ?? 100);

    function addPlayer() {
        const taken = new Set(state.players.map((player) => player.name));
        const free = NAMES.filter((name) => !taken.has(name));

        if (free.length === 0 || state.players.length >= maxPlayers()) {
            return;
        }

        const counts = FACTIONS.map((faction) => state.players.filter((player) => player.faction === faction.name).length);
        // New players join the smallest team, like the game's balancing.
        const faction = FACTIONS[counts.indexOf(Math.min(...counts))].name;
        steamCounter += BigInt(between(3, 900));
        const steamId = String(steamCounter);

        if (state.bans.some((ban) => ban.steamId === steamId)) {
            return;
        }

        state.players.push({ name: pick(free), steamId, faction, kills: 0, deaths: 0, cash: between(500, 4000), pingMs: between(18, 110) });
    }

    for (let i = 0; i < 46; i++) {
        addPlayer();
    }

    if (!state.players.some((player) => player.name === 'Rookie')) {
        state.players[0].name = 'Rookie';
    }

    for (const player of state.players) {
        player.kills = between(0, 14);
        player.deaths = between(0, 10);
    }

    function rotationEntries() {
        const lines = configText.split(/\r\n/).filter((line) => line.startsWith('.RotationEntries='));

        return lines.map((line, index) => {
            const fields = Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));

            return {
                index,
                map: fields.Map,
                experiences: (fields.Experiences ?? fields.Experience ?? '').split('+').filter(Boolean),
                lighting: fields.Lighting ?? null,
                zoneAlternator: fields.ZoneAlternator ?? null,
            };
        });
    }

    function travel(next) {
        state.map = next.map;
        state.experiences = next.experiences;
        state.lighting = next.lighting ?? pick(LIGHTINGS);
        state.zone = next.zone ?? `ZoneAlternator.${MAPS[next.map]?.name ?? next.map}.${pick(MAPS[next.map]?.zones ?? ['Default.Circle'])}`;
        state.scores = FACTIONS.map(() => 0);

        for (const player of state.players) {
            player.kills = 0;
            player.deaths = 0;
        }

        log(`travelled to ${state.map} ${state.experiences.join('+')} ${state.lighting}`);
    }

    function endMatch() {
        if (state.pendingMap) {
            travel(state.pendingMap);
            state.pendingMap = null;

            return;
        }

        const entries = rotationEntries();

        if (entries.length > 0) {
            state.rotationIndex = (state.rotationIndex + 1) % entries.length;
            travel(entries[state.rotationIndex]);
        } else {
            travel({ map: state.map, experiences: state.experiences, lighting: state.lighting });
        }
    }

    // The match plays itself.
    const timer = setInterval(() => {
        const hill = between(0, FACTIONS.length - 1);
        state.scores[hill] += between(0, 2);

        if (state.scores.some((score) => score >= 100)) {
            endMatch();
        }

        for (const player of state.players) {
            player.pingMs = Math.max(8, Math.min(240, player.pingMs + between(-6, 6)));

            if (Math.random() < 0.06) {
                player.kills += 1;
                player.cash += 150;
            }

            if (Math.random() < 0.05) {
                player.deaths += 1;
            }
        }

        if (Math.random() < 0.12) {
            addPlayer();
        }

        if (Math.random() < 0.08 && state.players.length > 10) {
            state.players.splice(between(1, state.players.length - 1), 1);
        }
    }, 2000);

    timer.unref();

    const json = (response, status, body) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
    };

    const routes = [
        ['GET', /^status$/, () => ({
            serverName: configText.match(/^ServerName=(.*)$/m)?.[1] ?? 'Wardogs server',
            map: MAPS[state.map]?.name ?? state.map,
            experiences: state.experiences,
            lighting: state.lighting,
            players: { current: state.players.length, max: maxPlayers() },
            factionScores: FACTIONS.map((faction, index) => ({ ...faction, score: state.scores[index] })),
            scoreTick: { current: state.tick, min: 18, max: 30 },
            alternator: state.zone,
            rotation: { nowIndex: state.rotationIndex, nextIndex: (state.rotationIndex + 1) % Math.max(1, rotationEntries().length) },
        })],
        ['GET', /^players$/, () => ({ players: state.players, count: state.players.length })],
        ['GET', /^health$/, () => ({ status: 'ok', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) + 3 * 3600 + 1260 })],
        ['GET', /^bans$/, () => ({ bans: state.bans, count: state.bans.length })],
        ['GET', /^server-id$/, () => ({ serverId: '997fe1e8-7006-40f9-b0ef-d3423008b2f2' })],
        ['GET', /^sponsor$/, () => ({ imageUrl: configText.match(/^ServerImageURL="?([^"\r\n]*)"?/m)?.[1] ?? '' })],
        ['GET', /^rotation$/, () => {
            const entries = rotationEntries();

            return {
                enabled: /^bEnabled=True/im.test(configText),
                mode: (configText.match(/^RotationMode=(\w+)/m)?.[1] ?? 'Ordered').toLowerCase(),
                entries: entries.map((entry, index) => ({
                    ...entry,
                    status: index === state.rotationIndex ? 'now' : index === (state.rotationIndex + 1) % entries.length ? 'next' : null,
                    denied: false,
                })),
                count: entries.length,
            };
        }],
        ['GET', /^catalog\/maps$/, () => ({ maps: Object.keys(MAPS).map((id) => ({ id, displayName: id })) })],
        ['GET', /^catalog\/lightings$/, () => ({ lightings: LIGHTINGS.map((id) => ({ id, displayName: id })) })],
        ['GET', /^catalog\/experiences$/, () => ({
            experiences: [...Object.values(MAPS).map((map) => map.mode), ...MODIFIERS].map((id) => ({ id, displayName: id.replace(/_/g, ' ') })),
        })],
        ['GET', /^catalog\/maps\/(\w+)\/experiences$/, ([map]) => (MAPS[map] ? { map, experiences: [MAPS[map].mode, ...MODIFIERS] } : null)],
        ['GET', /^catalog\/maps\/(\w+)\/alternators$/, ([map]) => (MAPS[map]
            ? { map, alternators: MAPS[map].zones.map((zone, index) => ({ index, tag: `ZoneAlternator.${MAPS[map].name}.${zone}`, displayName: `${MAPS[map].name} ${zone.replace('.', ' ')}` })) }
            : null)],
        ['GET', /^config$/, () => ({
            revision: revisionOf(configText),
            writable: true,
            text: configText,
            sections: [{ section: '/Script/WDGame.WDGameSession', keyOverrides: [{ key: 'ServerName', writable: false, lockedBy: 'RCON_FixedServerName' }] }],
        })],
        ['POST', /^match\/end$/, () => {
            endMatch();

            return { message: 'Match ended.' };
        }],
        ['POST', /^match\/restart$/, () => {
            travel({ map: state.map, experiences: state.experiences, lighting: state.lighting, zone: state.zone });

            return { message: 'Match restarted.' };
        }],
        ['POST', /^match\/map$/, (_, body) => {
            if (!MAPS[body?.map]) {
                return [422, { error: { code: 'unknown_map', message: `Unknown map ${body?.map}.` } }];
            }

            state.pendingMap = { map: body.map, experiences: body.experiences ?? [MAPS[body.map].mode], lighting: body.lighting ?? null, zone: body.zoneAlternator ?? null };
            endMatch();

            return { message: 'Travelling.' };
        }],
        ['POST', /^broadcast$/, (_, body) => {
            state.messages.push({ to: 'everyone', message: body?.message });
            log(`broadcast: ${body?.message}`);

            return { message: 'Sent.' };
        }],
        ['POST', /^bans$/, (_, body) => {
            // Banning someone banned already replaces their ban, so the list never holds them twice.
            state.bans = state.bans.filter((ban) => ban.steamId !== body.steamId);
            state.bans.push({ steamId: body.steamId, bannedAtUtc: new Date().toISOString(), bannedBy: 'rcon', reason: body.reason ?? null });
            state.players = state.players.filter((player) => player.steamId !== body.steamId);

            return { message: 'Banned.' };
        }],
        ['DELETE', /^bans\/(\d+)$/, ([steamId]) => {
            const before = state.bans.length;
            state.bans = state.bans.filter((ban) => ban.steamId !== steamId);

            return before === state.bans.length ? [404, { error: 'That player is not banned.' }] : { message: 'Unbanned.' };
        }],
        ['POST', /^players\/(\d+)\/(kick|kill|message)$/, ([steamId, verb], body) => {
            const player = state.players.find((entry) => entry.steamId === steamId);

            if (!player) {
                return [404, { error: { code: 'player_not_found', message: 'That player is not on the server.' } }];
            }

            if (verb === 'kick') {
                state.players = state.players.filter((entry) => entry !== player);
            } else if (verb === 'kill') {
                player.deaths += 1;
            } else {
                state.messages.push({ to: player.name, message: body?.message });
            }

            log(`${verb} ${player.name}`, body ?? '');

            return { message: 'Done.' };
        }],
        ['PATCH', /^players\/(\d+)$/, ([steamId], body) => {
            const player = state.players.find((entry) => entry.steamId === steamId);

            if (!player) {
                return [404, { error: 'That player is not on the server.' }];
            }

            if (!FACTIONS.some((faction) => faction.name === body?.faction)) {
                return [422, { error: `Unknown faction ${body?.faction}.` }];
            }

            player.faction = body.faction;

            return { message: 'Moved.' };
        }],
    ];

    const server = createServer((request, response) => {
        if (request.headers.authorization !== `Bearer ${password}`) {
            return json(response, 401, { error: 'unauthorized' });
        }

        const url = new URL(request.url ?? '/', 'http://localhost');
        const endpoint = url.pathname.replace(/^\/v1\//, '');
        let raw = '';

        request.on('data', (chunk) => {
            raw += chunk;
        });

        request.on('end', () => {
            if (request.method === 'PUT' && endpoint === 'config') {
                const revision = String(request.headers['if-match'] ?? '').replace(/"/g, '');

                if (revision !== revisionOf(configText)) {
                    return json(response, 412, { error: 'The config changed since it was read.' });
                }

                const players = Number(raw.match(/^MaxPlayers=(\d+)/m)?.[1] ?? 100);

                if (players < 1 || players > 128) {
                    return json(response, 422, { errors: [{ key: 'MaxPlayers', message: 'must be 1 to 128' }] });
                }

                configText = raw;
                log('config saved');

                return json(response, 200, { ok: true, revision: revisionOf(configText) });
            }

            let body = null;

            try {
                body = raw ? JSON.parse(raw) : null;
            } catch {
                return json(response, 400, { error: 'Invalid JSON.' });
            }

            for (const [method, pattern, handle] of routes) {
                const match = endpoint.match(pattern);

                if (match && method === request.method) {
                    const answer = handle(match.slice(1), body);

                    if (answer === null) {
                        return json(response, 404, { error: 'Not found.' });
                    }

                    return Array.isArray(answer) ? json(response, answer[0], answer[1]) : json(response, 200, answer);
                }
            }

            json(response, 404, { error: 'Not found.' });
        });
    });

    await new Promise((resolve) => server.listen(options.port ?? 47990, '127.0.0.1', resolve));
    const port = server.address().port;
    log(`listening on http://127.0.0.1:${port}/v1 (password "${password}")`);

    return {
        port,
        password,
        close: () => new Promise((resolve) => {
            clearInterval(timer);
            server.close(() => resolve());
            server.closeAllConnections?.();
        }),
    };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    startMockServer({ port: Number(process.argv[2] ?? 47990), password: process.argv[3] ?? 'mock-secret' });
}
