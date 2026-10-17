import { createHash, randomUUID } from 'node:crypto';

/**
 * Linked ban lists: several servers that share one ban list. A game server
 * only keeps its own bans, so the shared list lives on this PC (in
 * banlists.json) and is copied to each server when someone syncs, after
 * they have seen and confirmed what will change.
 *
 * Bans lifted through the app leave a tombstone, so a sync lifts them on
 * the other servers too instead of copying them back. A tombstone wins
 * over a ban older than it; a ban newer than the tombstone (the player was
 * banned again) brings the ban back.
 *
 * No Electron here, so the planning can be tested on its own.
 */

export const GROUP_NAME_MAX = 60;
export const DEFAULT_GROUP_NAME = 'Global bans';

/** Tombstones are kept so an offline server's old copy is lifted when it is back; this caps the file. */
const TOMBSTONES_KEPT = 5000;

/**
 * @typedef {{ steamId: string, reason: string | null, bannedAt: string | null, bannedBy?: string | null, sourceServerId?: string | null }} SharedBan
 * @typedef {{ steamId: string, removedAt: string }} Tombstone
 * @typedef {{ id: string, name: string, serverIds: string[], bans: SharedBan[], tombstones: Tombstone[], createdAt: string, lastSyncedAt: string | null }} BanGroup
 * @typedef {{ steamId: string, bannedAt: string | null, bannedBy?: string | null, reason: string | null }} ServerBan
 * @typedef {{ serverId: string, serverName: string, bans?: ServerBan[], skipped?: string }} Reading
 */

const STEAM_ID = /^\d{17}$/;

const time = (iso) => {
    const value = iso ? Date.parse(iso) : NaN;

    return Number.isNaN(value) ? null : value;
};

/** A stored ban kept to its shape; anything that is not a Steam ID is dropped. */
function cleanBan(ban) {
    if (!ban || !STEAM_ID.test(String(ban.steamId ?? ''))) {
        return null;
    }

    return {
        steamId: String(ban.steamId),
        reason: typeof ban.reason === 'string' && ban.reason !== '' ? ban.reason : null,
        bannedAt: time(ban.bannedAt) !== null ? new Date(time(ban.bannedAt)).toISOString() : null,
        bannedBy: typeof ban.bannedBy === 'string' && ban.bannedBy !== '' ? ban.bannedBy : null,
        sourceServerId: typeof ban.sourceServerId === 'string' ? ban.sourceServerId : null,
    };
}

/** What banlists.json holds, kept to its shapes, so a hand-edited file cannot break the app. */
export function readGroups(raw) {
    const list = Array.isArray(raw?.groups) ? raw.groups : [];
    const claimed = new Set();

    return list
        .filter((group) => group && typeof group.id === 'string')
        .map((group) => {
            // A server is in at most one group: a later group loses a server an earlier one has.
            const serverIds = [...new Set((Array.isArray(group.serverIds) ? group.serverIds : []).map(String))].filter((id) => !claimed.has(id));
            serverIds.forEach((id) => claimed.add(id));

            const bans = new Map();

            for (const ban of Array.isArray(group.bans) ? group.bans : []) {
                const clean = cleanBan(ban);

                if (clean) {
                    bans.set(clean.steamId, clean);
                }
            }

            return {
                id: group.id,
                name: String(group.name ?? DEFAULT_GROUP_NAME).trim().slice(0, GROUP_NAME_MAX) || DEFAULT_GROUP_NAME,
                serverIds,
                bans: [...bans.values()],
                tombstones: (Array.isArray(group.tombstones) ? group.tombstones : [])
                    .filter((entry) => entry && STEAM_ID.test(String(entry.steamId ?? '')) && time(entry.removedAt) !== null)
                    .map((entry) => ({ steamId: String(entry.steamId), removedAt: new Date(time(entry.removedAt)).toISOString() })),
                createdAt: time(group.createdAt) !== null ? group.createdAt : new Date(0).toISOString(),
                lastSyncedAt: time(group.lastSyncedAt) !== null ? group.lastSyncedAt : null,
            };
        });
}

/** The file as it is written. */
export const toFile = (groups) => ({ version: 1, groups });

/** The group a server is linked in, if any. */
export const groupOf = (groups, serverId) => groups.find((group) => group.serverIds.includes(serverId)) ?? null;

/**
 * Create a group, or rename it or change its servers. The window checks
 * the same, but the main process never trusts it.
 *
 * @param {BanGroup[]} groups
 * @param {{ id?: string, name?: string, serverIds?: string[] }} input
 * @param {{ id: string, name: string }[]} saved the saved servers
 * @returns {{ groups: BanGroup[], group: BanGroup } | { error: string }}
 */
export function saveGroup(groups, input, saved, at = new Date().toISOString()) {
    const existing = input?.id ? groups.find((group) => group.id === String(input.id)) : undefined;

    if (input?.id && !existing) {
        return { error: 'That ban list no longer exists.' };
    }

    const name = input?.name === undefined && existing ? existing.name : String(input?.name ?? '').trim();

    if (name === '' || name.length > GROUP_NAME_MAX) {
        return { error: `Give the ban list a name of up to ${GROUP_NAME_MAX} characters.` };
    }

    if (groups.some((group) => group.id !== existing?.id && group.name.toLowerCase() === name.toLowerCase())) {
        return { error: `There is already a ban list called “${name}”.` };
    }

    const wanted = input?.serverIds === undefined && existing ? existing.serverIds : Array.isArray(input?.serverIds) ? [...new Set(input.serverIds.map(String))] : [];

    for (const serverId of wanted) {
        const server = saved.find((entry) => entry.id === serverId);

        if (!server) {
            return { error: 'One of those servers is no longer saved.' };
        }

        const other = groups.find((group) => group.id !== existing?.id && group.serverIds.includes(serverId));

        if (other) {
            return { error: `${server.name} is already linked to “${other.name}”. A server can be in one ban list.` };
        }
    }

    /** @type {BanGroup} */
    const group = existing
        ? { ...existing, name, serverIds: wanted }
        : { id: randomUUID(), name, serverIds: wanted, bans: [], tombstones: [], createdAt: at, lastSyncedAt: null };

    return { groups: existing ? groups.map((entry) => (entry.id === group.id ? group : entry)) : [...groups, group], group };
}

/** A server that is removed from the app leaves its group. */
export const dropServer = (groups, serverId) => groups.map((group) => ({ ...group, serverIds: group.serverIds.filter((id) => id !== serverId) }));

/**
 * A ban made through the app on a linked server joins the shared list, so
 * the next sync spreads it. A newer ban beats an older tombstone.
 *
 * @returns {{ groups: BanGroup[], group: BanGroup | null }}
 */
export function recordBan(groups, serverId, ban, at = new Date().toISOString()) {
    const group = groupOf(groups, serverId);
    const clean = cleanBan({ ...ban, bannedAt: at, sourceServerId: serverId });

    if (!group || !clean) {
        return { groups, group: null };
    }

    const next = {
        ...group,
        bans: [...group.bans.filter((entry) => entry.steamId !== clean.steamId), clean],
        tombstones: group.tombstones.filter((entry) => entry.steamId !== clean.steamId),
    };

    return { groups: groups.map((entry) => (entry.id === group.id ? next : entry)), group: next };
}

/**
 * A ban lifted through the app "on all linked servers": it leaves the
 * shared list and a tombstone tells the next sync to lift it everywhere.
 *
 * @returns {{ groups: BanGroup[], group: BanGroup | null }}
 */
export function recordUnban(groups, serverId, steamId, at = new Date().toISOString()) {
    const group = groupOf(groups, serverId);

    if (!group || !STEAM_ID.test(String(steamId))) {
        return { groups, group: null };
    }

    const next = {
        ...group,
        bans: group.bans.filter((entry) => entry.steamId !== steamId),
        tombstones: [...group.tombstones.filter((entry) => entry.steamId !== steamId), { steamId: String(steamId), removedAt: at }].slice(-TOMBSTONES_KEPT),
    };

    return { groups: groups.map((entry) => (entry.id === group.id ? next : entry)), group: next };
}

/** Undated bans (written into the server file by hand) count as older than anything. */
const dated = (ban) => time(ban.bannedAt) ?? -Infinity;

/**
 * What a sync would change, without changing anything.
 *
 * The shared list is every reachable server's bans plus the bans the group
 * already knows, minus tombstoned Steam IDs. Each server is then told what
 * it lacks (toAdd) and which tombstoned bans it still has (toRemove). A
 * server that could not be read is skipped and reported: it is never
 * taken to have no bans, which would spread nothing to it but also never
 * lift anything it has.
 *
 * @param {BanGroup} group
 * @param {Reading[]} readings one per linked server
 */
export function planSync(group, readings) {
    const reachable = readings.filter((reading) => !reading.skipped && Array.isArray(reading.bans));
    const skipped = readings.filter((reading) => reading.skipped || !Array.isArray(reading.bans)).map((reading) => ({ serverId: reading.serverId, serverName: reading.serverName, reason: reading.skipped ?? 'Could not read its bans.' }));

    /** @type {Map<string, { record: SharedBan, fromGroup: boolean, newest: number }>} */
    const candidates = new Map();

    const consider = (ban, fromGroup, sourceServerId) => {
        const clean = cleanBan({ ...ban, sourceServerId: ban.sourceServerId ?? sourceServerId });

        if (!clean) {
            return;
        }

        const seen = candidates.get(clean.steamId);

        if (!seen) {
            candidates.set(clean.steamId, { record: clean, fromGroup, newest: dated(clean) });

            return;
        }

        seen.newest = Math.max(seen.newest, dated(clean));

        // The group's own record keeps the original reason and source; among
        // servers, the oldest copy is the original ban.
        if (!seen.fromGroup && (fromGroup || dated(clean) < dated(seen.record))) {
            seen.record = clean;
            seen.fromGroup = fromGroup;
        }
    };

    group.bans.forEach((ban) => consider(ban, true, null));
    reachable.forEach((reading) => reading.bans.forEach((ban) => consider(ban, false, reading.serverId)));

    const tombstones = new Map(group.tombstones.map((entry) => [entry.steamId, entry]));
    /** @type {SharedBan[]} */
    const shared = [];

    for (const [steamId, candidate] of candidates) {
        const tombstone = tombstones.get(steamId);

        if (tombstone && time(tombstone.removedAt) >= candidate.newest) {
            continue;
        }

        // Banned again after it was lifted: the ban is back.
        tombstones.delete(steamId);
        shared.push(candidate.record);
    }

    shared.sort((a, b) => dated(a) - dated(b) || a.steamId.localeCompare(b.steamId));

    const servers = reachable.map((reading) => {
        const has = new Set(reading.bans.map((ban) => String(ban.steamId)));

        return {
            serverId: reading.serverId,
            serverName: reading.serverName,
            toAdd: shared.filter((ban) => !has.has(ban.steamId)),
            toRemove: [...tombstones.values()].filter((entry) => has.has(entry.steamId)),
        };
    });

    const missing = servers.reduce((sum, server) => sum + server.toAdd.length, 0);
    const lifting = servers.reduce((sum, server) => sum + server.toRemove.length, 0);

    return {
        groupId: group.id,
        groupName: group.name,
        shared,
        tombstones: [...tombstones.values()],
        servers,
        skipped,
        missing,
        lifting,
        serversBehind: servers.filter((server) => server.toAdd.length + server.toRemove.length > 0).length,
        fingerprint: fingerprint(servers),
    };
}

/**
 * A short digest of exactly what a plan would write. A sync only runs when
 * the plan it reads fresh still matches the preview the user confirmed, so
 * nothing they did not see is ever written.
 */
export function fingerprint(servers) {
    const changes = servers
        .map((server) => `${server.serverId}:+${server.toAdd.map((ban) => ban.steamId).sort().join(',')}:-${server.toRemove.map((entry) => entry.steamId).sort().join(',')}`)
        .sort()
        .join('|');

    return createHash('sha1').update(changes).digest('hex').slice(0, 16);
}

/**
 * Write a plan to the servers: one change at a time per server (servers in
 * parallel), each write sent once. A server that stops answering or
 * refuses the password is not written to again in this run; the changes
 * left are reported as failed.
 *
 * @param {ReturnType<typeof planSync>} plan
 * @param {{ ban: (serverId: string, ban: SharedBan) => Promise<void>, unban: (serverId: string, steamId: string) => Promise<void>, logged?: (serverId: string, change: { kind: 'add' | 'remove', steamId: string, reason?: string | null, ok: boolean, error?: string }) => Promise<void> }} writer
 */
export async function applyPlan(plan, writer) {
    const message = (error) => (error instanceof Error ? error.message : String(error));

    const servers = await Promise.all(
        plan.servers.map(async (server) => {
            const result = { serverId: server.serverId, serverName: server.serverName, added: 0, removed: 0, failures: [] };
            /** @type {string | null} */
            let stopped = null;

            const changes = [
                ...server.toRemove.map((entry) => ({ kind: /** @type {const} */ ('remove'), steamId: entry.steamId, reason: null, ban: null })),
                ...server.toAdd.map((ban) => ({ kind: /** @type {const} */ ('add'), steamId: ban.steamId, reason: ban.reason, ban })),
            ];

            for (const change of changes) {
                if (stopped) {
                    result.failures.push({ kind: change.kind, steamId: change.steamId, error: stopped });
                    continue;
                }

                try {
                    if (change.kind === 'add') {
                        await writer.ban(server.serverId, change.ban);
                        result.added++;
                    } else {
                        await writer.unban(server.serverId, change.steamId);
                        result.removed++;
                    }

                    await writer.logged?.(server.serverId, { kind: change.kind, steamId: change.steamId, reason: change.reason, ok: true });
                } catch (error) {
                    result.failures.push({ kind: change.kind, steamId: change.steamId, error: message(error) });
                    await writer.logged?.(server.serverId, { kind: change.kind, steamId: change.steamId, reason: change.reason, ok: false, error: message(error) });

                    if (error?.unreachable || error?.wrongPassword) {
                        stopped = `Not sent: ${server.serverName} stopped answering.`;
                    }
                }
            }

            return result;
        }),
    );

    return {
        servers,
        skipped: plan.skipped,
        added: servers.reduce((sum, server) => sum + server.added, 0),
        removed: servers.reduce((sum, server) => sum + server.removed, 0),
        failed: servers.reduce((sum, server) => sum + server.failures.length, 0),
    };
}

/**
 * The group after a sync: the shared list it was planned from, the
 * tombstones still in force, and when it was synced. Failed writes stay
 * differences, so the next sync tries them again. A ban or lift recorded
 * through the app while the sync ran is kept on top of the plan.
 *
 * @param {BanGroup} current the group as stored now
 * @param {BanGroup} started the group the plan was made from
 */
export function afterSync(current, started, plan, at = new Date().toISOString()) {
    const banKey = (ban) => `${ban.steamId}@${ban.bannedAt}`;
    const tombstoneKey = (entry) => `${entry.steamId}@${entry.removedAt}`;
    const knownBans = new Set(started.bans.map(banKey));
    const knownTombstones = new Set(started.tombstones.map(tombstoneKey));

    const bans = new Map(plan.shared.map((ban) => [ban.steamId, ban]));
    const tombstones = new Map(plan.tombstones.map((entry) => [entry.steamId, entry]));

    const meanwhile = [
        ...current.bans.filter((ban) => !knownBans.has(banKey(ban))).map((ban) => ({ at: dated(ban), ban, tombstone: null })),
        ...current.tombstones.filter((entry) => !knownTombstones.has(tombstoneKey(entry))).map((entry) => ({ at: time(entry.removedAt) ?? 0, ban: null, tombstone: entry })),
    ].sort((a, b) => a.at - b.at);

    for (const change of meanwhile) {
        if (change.ban) {
            bans.set(change.ban.steamId, change.ban);
            tombstones.delete(change.ban.steamId);
        } else if (change.tombstone) {
            tombstones.set(change.tombstone.steamId, change.tombstone);
            bans.delete(change.tombstone.steamId);
        }
    }

    return { ...current, bans: [...bans.values()], tombstones: [...tombstones.values()].slice(-TOMBSTONES_KEPT), lastSyncedAt: at };
}

/** Unlink a group's servers and forget its shared list. The servers keep their bans. */
export const removeGroup = (groups, groupId) => groups.filter((group) => group.id !== groupId);
