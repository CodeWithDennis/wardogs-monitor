import { rcon, RconError, BROADCAST_MAX, MESSAGE_MAX, REASON_MAX } from './rcon.mjs';
import { isWritable, rotationValues, SESSION, settingsValues, validateRotation, validateSettings, WardogsConfig, writeField, FIELDS } from './config.mjs';
import { activity, servers } from './store.mjs';

/**
 * What the window asks for, shaped the way the website's
 * GameServerPresenter shapes it. Reads that several views share are cached
 * briefly, so the main window and the mini monitor polling together cost
 * one request, not two.
 */

/** The names players know the maps by; the server names them by region. */
export const MAP_NAMES = { Europe: 'Ozeti', Kavkazi: 'Bakurani', NorthAmerica: 'Zestafona' };

const LIVE_SECONDS = 2;
const LIST_SECONDS = 15;
const CATALOG_SECONDS = 3600;

/** @type {Map<string, { until: number, value: Promise<any> }>} */
const cache = new Map();

function remember(key, seconds, load) {
    const hit = cache.get(key);

    if (hit && hit.until > Date.now()) {
        return hit.value;
    }

    const value = load();
    cache.set(key, { until: Date.now() + seconds * 1000, value });
    value.catch(() => cache.delete(key));

    return value;
}

function forget(serverId, ...names) {
    for (const name of names) {
        cache.delete(`${serverId}:${name}`);
    }
}

const message = (error) => (error instanceof RconError || error instanceof Error ? error.message : String(error));

/**
 * The server read live: status, players and uptime. An offline server
 * comes back as `online: false` with the reason, never as an error.
 */
export function live(serverId) {
    return remember(`${serverId}:live`, LIVE_SECONDS, async () => {
        const checkedAt = new Date().toISOString();

        try {
            const target = await servers.target(serverId);
            const [status, players, health] = await Promise.all([rcon.status(target), rcon.players(target), rcon.health(target)]);

            return normaliseLive(status, players, health, checkedAt);
        } catch (error) {
            return { online: false, error: message(error), checkedAt, status: null, players: [], uptimeSeconds: null };
        }
    });
}

/** @internal exported for tests */
export function normaliseLive(status, players, health, checkedAt) {
    const factionColors = Object.fromEntries((status.factionScores ?? []).map((faction) => [faction.name, faction.colorHex]));

    const shaped = players
        .map((player) => ({
            name: String(player.name),
            steamId: String(player.steamId),
            faction: player.faction ?? null,
            factionColor: factionColors[player.faction ?? ''] ?? null,
            kills: Number(player.kills ?? 0),
            deaths: Number(player.deaths ?? 0),
            cash: Number(player.cash ?? 0),
            pingMs: Number(player.pingMs ?? 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const tick = status.scoreTick ?? null;

    return {
        online: true,
        error: null,
        checkedAt,
        status: {
            name: String(status.serverName),
            map: String(status.map),
            experiences: (status.experiences ?? []).map(String),
            lighting: status.lighting ?? null,
            zone: status.alternator ?? null,
            players: Number(status.players.current),
            maxPlayers: Number(status.players.max),
            factions: (status.factionScores ?? []).map((faction) => {
                const members = shaped.filter((player) => player.faction === faction.name);

                return {
                    name: String(faction.name),
                    color: String(faction.colorHex),
                    score: Number(faction.score),
                    players: members.length,
                    cash: members.reduce((sum, player) => sum + player.cash, 0),
                };
            }),
            scoreTick: tick && tick.current !== undefined && tick.min !== undefined && tick.max !== undefined ? { current: Number(tick.current), min: Number(tick.min), max: Number(tick.max) } : null,
            rotationNow: status.rotation?.nowIndex ?? null,
            rotationNext: status.rotation?.nextIndex ?? null,
        },
        players: shaped,
        uptimeSeconds: Number(health.uptimeSeconds),
    };
}

export function bans(serverId) {
    return remember(`${serverId}:bans`, LIST_SECONDS, async () => {
        try {
            const list = await rcon.bans(await servers.target(serverId));

            return {
                error: null,
                bans: list.map((ban) => ({
                    steamId: String(ban.steamId),
                    // Bans written into the ini by hand carry a year-1 date: treat them as undated.
                    bannedAt: ban.bannedAtUtc && !String(ban.bannedAtUtc).startsWith('0001-') ? ban.bannedAtUtc : null,
                    bannedBy: ban.bannedBy ?? null,
                    reason: ban.reason ?? null,
                })),
            };
        } catch (error) {
            return { error: message(error), bans: [] };
        }
    });
}

export function rotation(serverId) {
    return remember(`${serverId}:rotation`, LIST_SECONDS, async () => {
        try {
            const answer = await rcon.rotation(await servers.target(serverId));

            return {
                error: null,
                enabled: Boolean(answer.enabled),
                mode: answer.mode ?? null,
                entries: answer.entries.map((entry) => ({
                    index: Number(entry.index),
                    map: String(entry.map),
                    experiences: (entry.experiences ?? []).map(String),
                    lighting: entry.lighting ?? null,
                    zone: entry.zoneAlternator ?? null,
                    status: entry.status ?? null,
                    denied: Boolean(entry.denied),
                })),
            };
        } catch (error) {
            return { error: message(error), enabled: false, mode: null, entries: [] };
        }
    });
}

/** The join code and banner. */
export function identity(serverId) {
    return remember(`${serverId}:identity`, CATALOG_SECONDS, async () => {
        const target = await servers.target(serverId);
        const [serverId_, bannerUrl] = await Promise.all([rcon.serverId(target).catch(() => null), rcon.bannerUrl(target).catch(() => null)]);

        return { serverId: serverId_, bannerUrl };
    });
}

/**
 * What the server can run, for the map pickers: every map with its game
 * modes, modifiers (the experiences every map shares) and zone layouts,
 * plus the lightings.
 */
export function catalog(serverId) {
    return remember(`${serverId}:catalog`, CATALOG_SECONDS, async () => {
        try {
            const target = await servers.target(serverId);
            const [maps, experiences, lightings] = await Promise.all([rcon.maps(target), rcon.experiences(target), rcon.lightings(target)]);
            const names = Object.fromEntries(experiences.map((experience) => [experience.id, experience.displayName ?? experience.id]));

            const perMap = await Promise.all(
                maps.map(async (map) => ({
                    id: map.id,
                    experiences: await rcon.mapExperiences(target, map.id),
                    zones: await rcon.mapAlternators(target, map.id),
                })),
            );

            const shared = perMap.length > 1
                ? perMap[0].experiences.filter((id) => perMap.every((map) => map.experiences.includes(id)))
                : (perMap[0]?.experiences ?? []).slice(1);

            const named = (id) => ({ id, name: names[id] ?? id });

            return {
                error: null,
                maps: perMap.map((map) => ({
                    id: map.id,
                    name: MAP_NAMES[map.id] ?? (map.zones[0]?.tag?.split('.')[1] || map.id),
                    modes: map.experiences.filter((id) => !shared.includes(id)).map(named),
                    modifiers: map.experiences.filter((id) => shared.includes(id)).map(named),
                    zones: map.zones.map((zone) => ({ id: zone.tag, name: zone.displayName ?? zone.tag })),
                })),
                lightings: lightings.map((lighting) => ({ id: lighting.id, name: lighting.displayName ?? lighting.id })),
            };
        } catch (error) {
            cache.delete(`${serverId}:catalog`);

            return { error: message(error), maps: [], lightings: [] };
        }
    });
}

/** The settings and rotation as the forms show them, with the revision they were read at. */
export async function readSettings(serverId) {
    try {
        const document = await rcon.config(await servers.target(serverId));
        const config = WardogsConfig.parse(document.text);

        return {
            error: null,
            revision: document.revision,
            writable: document.writable !== false,
            settings: {
                ...settingsValues(config),
                server_name: config.get(SESSION, 'ServerName') ?? '',
                server_name_locked: !isWritable(document, SESSION, 'ServerName'),
            },
            rotation: rotationValues(config),
        };
    } catch (error) {
        return { error: message(error), revision: null, writable: false, settings: null, rotation: null };
    }
}

class ValidationError extends Error {
    constructor(errors) {
        super(Object.values(errors)[0]);
        this.errors = errors;
    }
}

/** Fetch the document and make sure it is still the one the form was filled from. */
async function open(target, revision) {
    const document = await rcon.config(target);

    if (document.revision !== revision) {
        throw RconError.configChanged();
    }

    return { document, config: WardogsConfig.parse(document.text) };
}

/** Send the document back when it changed. */
async function close(target, config, document) {
    const after = config.toString();

    if (after !== document.text) {
        await rcon.putConfig(target, after, document.revision);
    }
}

async function saveSettings(target, { revision, values }) {
    const errors = validateSettings(values);

    if (Object.keys(errors).length > 0) {
        throw new ValidationError(errors);
    }

    const { document, config } = await open(target, revision);
    const old = settingsValues(config);
    const changed = [];

    if ((values.max_reserved_slots ?? 0) > (values.max_players ?? old.max_players)) {
        throw new ValidationError({ max_reserved_slots: `Reserved spots cannot be more than the server's ${values.max_players ?? old.max_players} player slots.` });
    }

    for (const field of Object.keys(FIELDS)) {
        if (field in values && values[field] !== old[field]) {
            writeField(config, field, values[field]);
            changed.push(field === 'server_password' ? 'join password' : FIELDS[field][1]);
        }
    }

    if (Array.isArray(values.reserved_steam_ids) && JSON.stringify(values.reserved_steam_ids) !== JSON.stringify(old.reserved_steam_ids)) {
        config.setArray(SESSION, 'DefaultReservedPlayerIds', values.reserved_steam_ids);
        changed.push('reserved players');
    }

    const name = config.get(SESSION, 'ServerName') ?? '';

    if (typeof values.server_name === 'string' && values.server_name !== name && isWritable(document, SESSION, 'ServerName')) {
        config.set(SESSION, 'ServerName', values.server_name);
        changed.push('ServerName');
    }

    await close(target, config, document);

    return changed.length ? `Changed ${changed.join(', ')}` : 'Nothing changed';
}

async function saveRotation(target, { revision, enabled, mode, entries }) {
    const problem = validateRotation({ enabled, mode, entries });

    if (problem) {
        throw new ValidationError({ rotation: problem });
    }

    const { document, config } = await open(target, revision);
    const old = rotationValues(config);

    if (old.enabled !== enabled) {
        config.setBool('/Script/WDGame.WDServerMapRotationSettings', 'bEnabled', enabled);
    }

    if (old.mode !== mode) {
        config.set('/Script/WDGame.WDServerMapRotationSettings', 'RotationMode', mode);
    }

    const clean = entries.map((entry) => ({ map: entry.map, experiences: entry.experiences, lighting: entry.lighting || null, zone: entry.zone || null }));

    if (JSON.stringify(old.entries) !== JSON.stringify(clean)) {
        config.setRotationEntries(clean);
    }

    await close(target, config, document);

    return `Rotation ${enabled ? 'on' : 'off'}, ${mode.toLowerCase()}, ${clean.length} ${clean.length === 1 ? 'match' : 'matches'}`;
}

const text = (value, max, label) => {
    const trimmed = String(value ?? '').trim();

    if (trimmed === '') {
        throw new ValidationError({ message: `Write a ${label} first.` });
    }

    if (trimmed.length > max) {
        throw new ValidationError({ message: `The ${label} can be at most ${max} characters.` });
    }

    return trimmed;
};

const steam = (value) => {
    const steamId = String(value ?? '').trim();

    if (!/^\d{17}$/.test(steamId)) {
        throw new ValidationError({ steamId: 'A Steam ID is 17 digits, like 76561198000000000.' });
    }

    return steamId;
};

/**
 * Every action the window can take: name => what it does and how it reads
 * in the activity log. Each returns the log line.
 *
 * @type {Record<string, { forget: string[], run: (target: any, args: any) => Promise<string> }>}
 */
const ACTIONS = {
    broadcast: {
        forget: [],
        run: async (target, { message: body }) => {
            const clean = text(body, BROADCAST_MAX, 'message');
            await rcon.broadcast(target, clean);

            return `Broadcast "${clean}"`;
        },
    },
    message: {
        forget: [],
        run: async (target, { steamId, name, message: body }) => {
            const clean = text(body, MESSAGE_MAX, 'message');
            await rcon.message(target, steam(steamId), clean);

            return `Messaged ${name ?? steamId}: "${clean}"`;
        },
    },
    kick: {
        forget: ['live'],
        run: async (target, { steamId, name, reason }) => {
            const clean = text(reason, REASON_MAX, 'reason');
            await rcon.kick(target, steam(steamId), clean);

            return `Kicked ${name ?? steamId}: ${clean}`;
        },
    },
    kill: {
        forget: ['live'],
        run: async (target, { steamId, name }) => {
            await rcon.kill(target, steam(steamId));

            return `Killed ${name ?? steamId}`;
        },
    },
    faction: {
        forget: ['live'],
        run: async (target, { steamId, name, faction }) => {
            await rcon.changeFaction(target, steam(steamId), text(faction, 60, 'faction'));

            return `Moved ${name ?? steamId} to ${faction}`;
        },
    },
    ban: {
        forget: ['live', 'bans'],
        run: async (target, { steamId, name, reason }) => {
            const clean = String(reason ?? '').trim();

            if (clean.length > REASON_MAX) {
                throw new ValidationError({ reason: `The reason can be at most ${REASON_MAX} characters.` });
            }

            await rcon.ban(target, steam(steamId), clean || null);

            return `Banned ${name ?? steamId}${clean ? `: ${clean}` : ''}`;
        },
    },
    unban: {
        forget: ['bans'],
        run: async (target, { steamId }) => {
            await rcon.unban(target, steam(steamId));

            return `Unbanned ${steamId}`;
        },
    },
    endMatch: {
        forget: ['live', 'rotation'],
        run: async (target) => {
            await rcon.endMatch(target);

            return 'Ended the match';
        },
    },
    restartMatch: {
        forget: ['live'],
        run: async (target) => {
            await rcon.restartMatch(target);

            return 'Restarted the match';
        },
    },
    changeMap: {
        forget: ['live', 'rotation'],
        run: async (target, change) => {
            if (!change?.map) {
                throw new ValidationError({ map: 'Pick a map.' });
            }

            await rcon.changeMap(target, change);

            return `Changed the map to ${MAP_NAMES[change.map] ?? change.map} (${[...(change.experiences ?? []), change.lighting].filter(Boolean).join(', ')})`;
        },
    },
    saveSettings: { forget: [], run: saveSettings },
    saveRotation: { forget: ['rotation'], run: saveRotation },
};

/**
 * Run an action against a server and log it locally either way.
 *
 * @returns {Promise<{ ok: true, summary: string } | { ok: false, error: string, errors?: Record<string, string>, configChanged?: boolean }>}
 */
export async function act(serverId, name, args = {}) {
    const action = ACTIONS[name];

    if (!action) {
        return { ok: false, error: 'Unknown action.' };
    }

    const server = (await servers.list()).find((entry) => entry.id === serverId);

    if (!server) {
        return { ok: false, error: 'That server is no longer saved.' };
    }

    try {
        const summary = await action.run(await servers.target(serverId), args);
        forget(serverId, ...action.forget);
        await activity.add({ serverId, serverName: server.name, action: name, summary, ok: true });

        return { ok: true, summary };
    } catch (error) {
        if (error instanceof ValidationError) {
            return { ok: false, error: error.message, errors: error.errors };
        }

        await activity.add({ serverId, serverName: server.name, action: name, summary: name, ok: false, error: message(error) });

        return { ok: false, error: message(error), configChanged: error instanceof RconError && error.configChanged };
    }
}

/**
 * Check a server answers with this password before it is saved, and return
 * its own name to suggest as the label.
 *
 * @param {{ host: string, port: number, password: string }} target
 */
export async function probe(target) {
    try {
        const status = await rcon.status(target);

        return { ok: true, name: String(status.serverName) };
    } catch (error) {
        return { ok: false, error: message(error) };
    }
}

export function clearCache(serverId) {
    forget(serverId, 'live', 'bans', 'rotation', 'identity', 'catalog');
}
