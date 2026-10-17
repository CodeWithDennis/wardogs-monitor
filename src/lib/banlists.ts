import { computed, reactive, watch } from 'vue';
import { act, choose, confirm, refreshLive, state, toast } from '@/lib/store';
import type { Ban, BanGroup, BanSyncPlan } from '@/types';

/**
 * Linked ban lists in the window: the groups, the sync preview, and the
 * start-up check for differences. A game server only keeps its own bans,
 * so the shared list lives on this PC and is copied to the servers only
 * when someone confirms a preview. Nothing here writes to a server on its
 * own.
 */

export const DEFAULT_GROUP_NAME = 'Global bans';

export const banLists = reactive({
    groups: [] as BanGroup[],
    loaded: false,
    /** The sync preview: the plan shown, while it loads or syncs. */
    preview: null as null | { groupId: string; plan: BanSyncPlan | null; error: string | null; note: string | null; loading: boolean; syncing: boolean },
    /** Groups found to differ when the app started, for the banner. */
    startup: [] as BanSyncPlan[],
    bannerDismissed: false,
    /** "Check differences" results in Options, per group. */
    checks: {} as Record<string, { loading: boolean; plan: BanSyncPlan | null; error: string | null }>,
});

export async function loadBanLists(): Promise<void> {
    banLists.groups = await window.panel.banLists.list();
    banLists.loaded = true;
}

/** The group a server is linked in, if any. */
export function groupOf(serverId: string | null): BanGroup | null {
    return serverId ? (banLists.groups.find((group) => group.serverIds.includes(serverId)) ?? null) : null;
}

/** The names of a group's servers, as saved in the app. */
export function serverNames(group: BanGroup): string[] {
    return group.serverIds.map((id) => state.servers.find((server) => server.id === id)?.name).filter((name): name is string => Boolean(name));
}

/** "3 bans missing and 1 to lift on 2 servers", or null when the servers match. */
export function describeDifferences(missing: number, lifting: number, servers: number): string | null {
    if (missing + lifting === 0) {
        return null;
    }

    const parts = [missing > 0 ? `${missing} ${missing === 1 ? 'ban' : 'bans'} missing` : null, lifting > 0 ? `${lifting} to lift` : null].filter(Boolean);

    return `${parts.join(' and ')} on ${servers} ${servers === 1 ? 'server' : 'servers'}`;
}

/** Create a group, or rename it or change its servers. */
export async function saveBanList(input: { id?: string; name?: string; serverIds?: string[] }): Promise<BanGroup | null> {
    const result = await window.panel.banLists.save(JSON.parse(JSON.stringify(input)));
    await loadBanLists();

    if (!result.ok) {
        toast('error', 'That did not work', result.error);

        return null;
    }

    delete banLists.checks[result.group.id];

    return result.group;
}

/** A name for a new group that is not taken yet: "Global bans", then "Global bans 2". */
export function freeGroupName(): string {
    const taken = new Set(banLists.groups.map((group) => group.name.toLowerCase()));
    let name = DEFAULT_GROUP_NAME;

    for (let i = 2; taken.has(name.toLowerCase()); i++) {
        name = `${DEFAULT_GROUP_NAME} ${i}`;
    }

    return name;
}

/** Forget a group, after asking. The servers keep every ban they have. */
export async function removeBanList(group: BanGroup): Promise<void> {
    const yes = await confirm({
        title: `Delete “${group.name}”?`,
        body: 'Its servers are unlinked and the app forgets the shared list. Nothing is changed on the servers: they keep every ban they have now.',
        confirmLabel: 'Delete ban list',
        danger: true,
    });

    if (yes) {
        await window.panel.banLists.remove(group.id);
        delete banLists.checks[group.id];
        banLists.startup = banLists.startup.filter((plan) => plan.groupId !== group.id);
        await loadBanLists();
        toast('info', `Deleted “${group.name}”`);
    }
}

/** Options → "Check differences": read every linked server and show what differs. Writes nothing. */
export async function checkDifferences(groupId: string): Promise<void> {
    banLists.checks[groupId] = { loading: true, plan: null, error: null };
    const answer = await window.panel.banLists.plan(groupId);
    banLists.checks[groupId] = answer.ok ? { loading: false, plan: answer.plan, error: null } : { loading: false, plan: null, error: answer.error };
}

/**
 * Open the sync preview for a group. It reads the servers fresh and shows
 * per server what would be added and lifted; nothing is written until
 * confirmSync.
 */
export async function openSyncPreview(groupId: string, note: string | null = null): Promise<void> {
    banLists.preview = { groupId, plan: null, error: null, note, loading: true, syncing: false };
    const answer = await window.panel.banLists.plan(groupId);

    if (banLists.preview?.groupId !== groupId) {
        return;
    }

    banLists.preview = { ...banLists.preview, loading: false, plan: answer.ok ? answer.plan : null, error: answer.ok ? null : answer.error };
}

export function closeSyncPreview(): void {
    if (!banLists.preview?.syncing) {
        banLists.preview = null;
    }
}

/**
 * The user confirmed the preview: sync exactly that plan. When the bans
 * changed in the meantime, the main process writes nothing and hands back
 * the new plan, which is shown to be confirmed again.
 */
export async function confirmSync(): Promise<void> {
    const preview = banLists.preview;

    if (!preview?.plan || preview.syncing) {
        return;
    }

    preview.syncing = true;
    const plan = preview.plan;
    let result: Awaited<ReturnType<typeof window.panel.banLists.sync>>;

    try {
        result = await window.panel.banLists.sync(plan.groupId, plan.fingerprint);
    } finally {
        preview.syncing = false;
    }

    if (!result.ok) {
        if (result.changed && result.plan) {
            banLists.preview = { ...preview, plan: result.plan, note: result.error, syncing: false };
        } else {
            toast('error', 'The sync did not run', result.error);
        }

        return;
    }

    banLists.preview = null;
    banLists.startup = banLists.startup.filter((entry) => entry.groupId !== plan.groupId);
    delete banLists.checks[plan.groupId];
    await loadBanLists();
    state.revision++;

    for (const server of result.servers) {
        refreshLive(server.serverId, true).catch(() => undefined);
    }

    const changed = result.added + result.removed;
    const what = [result.added > 0 ? `added ${result.added} ${result.added === 1 ? 'ban' : 'bans'}` : null, result.removed > 0 ? `lifted ${result.removed} ${result.removed === 1 ? 'ban' : 'bans'}` : null].filter(Boolean).join(' and ');

    if (result.failed > 0) {
        const first = result.servers.flatMap((server) => server.failures.map((failure) => `${server.serverName}: ${failure.error}`))[0];
        toast('error', `Synced “${result.groupName}” with ${result.failed} ${result.failed === 1 ? 'failure' : 'failures'}`, `${what ? `${what[0].toUpperCase()}${what.slice(1)}. ` : ''}${first ?? ''} The next sync tries again.`);
    } else if (changed > 0) {
        toast('ok', `Synced “${result.groupName}”`, `${what[0].toUpperCase()}${what.slice(1)}.`);
    } else {
        toast('ok', `“${result.groupName}” is in sync`);
    }
}

/**
 * Lift a ban from the open server. On a linked server it asks whether to
 * lift it on every linked server (a tombstone, then the sync preview to
 * confirm the others) or only here, which the next sync would undo.
 */
export async function liftBan(entry: Ban): Promise<boolean> {
    const serverId = state.selectedId;
    const group = groupOf(serverId);
    const others = group ? group.serverIds.filter((id) => id !== serverId).length : 0;

    if (!group || others === 0) {
        const result = await act('unban', { steamId: entry.steamId, everywhere: Boolean(group) }, {
            confirm: { title: 'Lift this ban?', body: `${entry.steamId} can join the server again straight away.`, confirmLabel: 'Unban' },
        });

        if (result?.ok && group) {
            await loadBanLists();
        }

        return Boolean(result?.ok);
    }

    const answer = await choose({
        title: 'Lift this ban?',
        body: `${entry.steamId} is on “${group.name}”, shared with ${others} other ${others === 1 ? 'server' : 'servers'}. Lift it on all of them, or only here? Lifted only here, the next sync bans them here again.`,
        confirmLabel: `Lift on all ${others + 1} servers`,
        alternativeLabel: 'Only this server',
    });

    if (!answer) {
        return false;
    }

    const result = await act('unban', { steamId: entry.steamId, everywhere: answer === 'confirm' });

    if (!result?.ok) {
        return false;
    }

    await loadBanLists();

    if (answer === 'confirm') {
        await openSyncPreview(group.id, 'Lifted on this server. Confirm to lift it on the other linked servers too.');
    }

    return true;
}

/** What the start-up banner says, or null when there is nothing to say. */
export const startupDifferences = computed(() => {
    const plans = banLists.startup.filter((plan) => plan.missing + plan.lifting > 0);

    if (plans.length === 0) {
        return null;
    }

    return describeDifferences(
        plans.reduce((sum, plan) => sum + plan.missing, 0),
        plans.reduce((sum, plan) => sum + plan.lifting, 0),
        plans.reduce((sum, plan) => sum + plan.serversBehind, 0),
    );
});

/**
 * Load the groups and, once every linked server has its first live
 * reading, check each group for differences once. Read-only: it only
 * fills the banner, which opens the preview.
 */
export function startBanLists(): void {
    let checked = false;

    watch(
        () => banLists.loaded && state.ready && banLists.groups.flatMap((group) => (group.serverIds.length > 1 ? group.serverIds : [])).every((id) => !state.servers.some((server) => server.id === id) || state.lives[id] !== undefined),
        async (ready) => {
            if (!ready || checked) {
                return;
            }

            checked = true;
            const plans = await Promise.all(banLists.groups.filter((group) => group.serverIds.length > 1).map((group) => window.panel.banLists.plan(group.id)));
            banLists.startup = plans.flatMap((answer) => (answer.ok && answer.plan.missing + answer.plan.lifting > 0 ? [answer.plan] : []));
        },
    );

    // A ban through the app joins its group's list, and a removed server
    // leaves its group: keep the counts current.
    watch([() => state.revision, () => state.servers.length], () => loadBanLists());

    loadBanLists();
}
