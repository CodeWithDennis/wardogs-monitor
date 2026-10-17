import { computed, reactive, ref, watch } from 'vue';
import type { ActionResult, LicenceStatus, Limits, Live, Player, Preferences, SavedServer } from '@/types';

/** A player who was on a server and is gone now, kept so they can still be banned or watched. */
export interface LeftPlayer {
    name: string;
    steamId: string;
    faction: string | null;
    factionColor: string | null;
    kills: number;
    deaths: number;
    leftAt: number;
}

/** How many players who left each server keeps. */
const LEFT_KEPT = 150;

/**
 * The app's shared state: the saved servers, which one and which view is
 * open, every server's live reading (polled), toasts and the confirm
 * dialog. Every view reads from here.
 */

export type ControlView = 'overview' | 'players' | 'match' | 'rotation' | 'bans' | 'settings';
export type View = 'servers' | ControlView | 'activity' | 'options';

/** The views of one server, listed in the sidebar while a server is open. */
export const VIEWS: { id: ControlView; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'players', label: 'Players' },
    { id: 'match', label: 'Match' },
    { id: 'rotation', label: 'Rotation' },
    { id: 'bans', label: 'Bans' },
    { id: 'settings', label: 'Settings' },
];

/**
 * The rail's sections, like Guides / Lookup / Dungeons in the reference:
 * every server as cards, the open server's controls, the activity log and
 * the app's options.
 */
export type Section = 'servers' | 'control' | 'activity' | 'options';

export function sectionOf(view: View): Section {
    return view === 'servers' || view === 'activity' || view === 'options' ? view : 'control';
}

/** How often the servers that are not open are read, for the sidebar. */
const BACKGROUND_SECONDS = 30;
/** How many player-count readings a server keeps for its chart (an hour at 5 s). */
const HISTORY_POINTS = 720;

export const state = reactive({
    ready: false,
    servers: [] as SavedServer[],
    selectedId: null as string | null,
    view: 'servers' as View,
    /** The server view to come back to when the open server is shown again. */
    lastControlView: 'overview' as ControlView,
    /** Which server the activity log shows; null for all. */
    activityServer: null as string | null,
    /** The status filter on the server cards. */
    serverFilter: 'all' as 'all' | 'online' | 'offline',
    lives: {} as Record<string, Live | undefined>,
    loading: {} as Record<string, boolean>,
    history: {} as Record<string, { at: number; players: number }[]>,
    preferences: {
        refreshSeconds: 5,
        confirmActions: true,
        miniOpacity: 0.96,
        miniAlwaysOnTop: true,
        lastServerId: null,
        theme: 'midnight',
        accent: 'gold',
        zoom: 1,
        miniZoom: 1,
        notifyServerDown: true,
        notifyWatched: true,
        watchlist: [],
        broadcasts: [],
    } as Preferences,
    limits: null as Limits | null,
    version: '0.1.0',
    selectedPlayer: null as string | null,
    selectedBan: null as string | null,
    search: '',
    addingServer: false,
    editingServer: null as SavedServer | null,
    miniOpen: false,
    /** Players who left each server since the app opened, newest first. */
    left: {} as Record<string, LeftPlayer[]>,
    /** The tab Options opens on. */
    optionsTab: 'general',
    paletteOpen: false,
    licence: null as LicenceStatus | null,
    /** The Players view's tab: all, a faction, watched or left. */
    playersTab: 'all',
    /** Bumped after every action, so lists like bans and activity reload. */
    revision: 0,
});

export const selectedServer = computed(() => state.servers.find((server) => server.id === state.selectedId) ?? null);
export const section = computed(() => sectionOf(state.view));
export const selectedLive = computed(() => (state.selectedId ? state.lives[state.selectedId] : undefined));

/** A clock that ticks every second, for "checked 3s ago". */
export const now = ref(Date.now());
setInterval(() => (now.value = Date.now()), 1000);

// Toasts --------------------------------------------------------------------

export interface Toast {
    id: number;
    kind: 'ok' | 'error' | 'info';
    title: string;
    body?: string;
}

export const toasts = ref<Toast[]>([]);
let toastId = 0;

export function toast(kind: Toast['kind'], title: string, body?: string): void {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-3), { id, kind, title, body }];
    setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
}

export function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((entry) => entry.id !== id);
}

// Confirm dialog ------------------------------------------------------------

export interface ConfirmRequest {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
}

export const confirmation = ref<(ConfirmRequest & { resolve: (yes: boolean) => void }) | null>(null);

export function confirm(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
        confirmation.value = { ...request, resolve };
    });
}

export function answerConfirm(yes: boolean): void {
    confirmation.value?.resolve(yes);
    confirmation.value = null;
}

// Servers and live readings -------------------------------------------------

export async function refreshLive(serverId: string, force = false): Promise<void> {
    if (state.loading[serverId] && !force) {
        return;
    }

    state.loading[serverId] = true;

    try {
        if (force) {
            await window.panel.server.refresh(serverId);
        }

        const live = await window.panel.server.live(serverId);
        const previous = state.lives[serverId];
        state.lives[serverId] = live;
        noticeChanges(serverId, previous, live);

        if (live.online && live.status) {
            const points = state.history[serverId] ?? [];
            points.push({ at: Date.now(), players: live.status.players });
            state.history[serverId] = points.slice(-HISTORY_POINTS);
        }
    } finally {
        state.loading[serverId] = false;
    }
}

/**
 * What changed since the last reading: a server going down or coming back,
 * players leaving (kept in state.left) and watched players joining.
 */
function noticeChanges(serverId: string, previous: Live | undefined, live: Live): void {
    const server = state.servers.find((entry) => entry.id === serverId);

    if (!server || !previous || live.locked || previous.locked) {
        return;
    }

    if (previous.online && !live.online) {
        notify(`${server.name} is down`, live.error ?? 'It stopped answering.', serverId, state.preferences.notifyServerDown);
        toast('error', `${server.name} is down`, live.error ?? undefined);
    } else if (!previous.online && live.online) {
        notify(`${server.name} is back`, `${live.status?.players ?? 0} players online.`, serverId, state.preferences.notifyServerDown);
        toast('ok', `${server.name} is back online`);
    }

    if (!previous.online || !live.online) {
        return;
    }

    const now = new Set(live.players.map((player) => player.steamId));
    const before = new Set(previous.players.map((player) => player.steamId));
    const gone: LeftPlayer[] = previous.players
        .filter((player) => !now.has(player.steamId))
        .map((player) => ({ name: player.name, steamId: player.steamId, faction: player.faction, factionColor: player.factionColor, kills: player.kills, deaths: player.deaths, leftAt: Date.now() }));

    const kept = (state.left[serverId] ?? []).filter((player) => !now.has(player.steamId) && !gone.some((entry) => entry.steamId === player.steamId));
    state.left[serverId] = [...gone, ...kept].slice(0, LEFT_KEPT);

    const joined: Player[] = live.players.filter((player) => !before.has(player.steamId));

    for (const player of joined) {
        const watched = state.preferences.watchlist.find((entry) => entry.steamId === player.steamId);

        if (watched) {
            const why = watched.note ? ` (${watched.note})` : '';
            notify(`${player.name} joined ${server.name}`, `A watched player${why}.`, serverId, state.preferences.notifyWatched);
            toast('info', `${player.name} joined ${server.name}`, `A watched player${why}.`);
        }
    }
}

/** A Windows notification; clicking it brings the app forward on that server. */
function notify(title: string, body: string, serverId: string, enabled: boolean): void {
    if (!enabled || !('Notification' in window)) {
        return;
    }

    const notice = new Notification(title, { body });
    notice.onclick = () => {
        window.panel.focusMain();
        selectServer(serverId);
    };
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let backgroundTimer: ReturnType<typeof setInterval> | undefined;

function schedulePoll(): void {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
        if (!document.hidden) {
            if (state.view === 'servers') {
                await Promise.all(state.servers.map((server) => refreshLive(server.id).catch(() => undefined)));
            } else if (state.selectedId) {
                await refreshLive(state.selectedId).catch(() => undefined);
            }
        }

        schedulePoll();
    }, state.preferences.refreshSeconds * 1000);
}

function refreshBackground(): void {
    for (const server of state.servers) {
        if (server.id !== state.selectedId) {
            refreshLive(server.id).catch(() => undefined);
        }
    }
}

export async function loadServers(): Promise<void> {
    state.servers = await window.panel.servers.list();

    if (!state.servers.some((server) => server.id === state.selectedId)) {
        const remembered = state.servers.find((server) => server.id === state.preferences.lastServerId);
        state.selectedId = (remembered ?? state.servers[0])?.id ?? null;
    }
}

/**
 * Make a server the open one and, unless asked not to, show its controls
 * (on the view that was open last).
 */
export function selectServer(serverId: string, open = true): void {
    if (state.selectedId !== serverId) {
        state.selectedId = serverId;
        state.selectedPlayer = null;
        state.selectedBan = null;
        window.panel.preferences.set({ lastServerId: serverId });
        refreshLive(serverId);
    }

    if (open && sectionOf(state.view) !== 'control') {
        state.view = state.lastControlView;
    }
}

/** Open Options on one of its tabs. */
export function openOptions(tab = 'general'): void {
    state.optionsTab = tab;
    state.view = 'options';
}

export function openView(view: View): void {
    if (sectionOf(view) === 'control') {
        if (!state.selectedId) {
            return;
        }

        state.lastControlView = view as ControlView;
    }

    state.view = view;
}

/** Forget a server, after asking. The server itself is not touched. */
export async function removeServer(server: SavedServer): Promise<void> {
    const yes = await confirm({
        title: `Remove ${server.name}?`,
        body: 'The app forgets its address and RCON password. The server itself keeps running and is not changed. You can add it again any time.',
        confirmLabel: 'Remove server',
        danger: true,
    });

    if (!yes) {
        return;
    }

    const wasOpen = state.selectedId === server.id;

    await window.panel.servers.remove(server.id);
    delete state.lives[server.id];
    delete state.history[server.id];

    if (wasOpen) {
        state.selectedId = null;
    }

    await loadServers();

    // Its controls are gone: back to the cards.
    if (wasOpen && sectionOf(state.view) === 'control') {
        state.view = 'servers';
    }

    toast('info', `Removed ${server.name}`);
}

export async function init(): Promise<void> {
    const [preferences, limits, info, licence] = await Promise.all([window.panel.preferences.get(), window.panel.limits(), window.panel.appInfo(), window.panel.license.status()]);
    state.preferences = preferences;
    state.licence = licence;
    window.panel.license.onChange((next) => {
        state.licence = next;

        for (const server of state.servers) {
            refreshLive(server.id, true);
        }
    });
    state.limits = limits;
    state.version = info.version;
    await loadServers();
    // One server opens straight on its controls; several start on the cards.
    state.view = state.servers.length === 1 ? 'overview' : 'servers';
    state.ready = true;

    window.panel.preferences.onChange((next) => {
        state.preferences = next;
        schedulePoll();
    });
    window.panel.mini.onClosed(() => (state.miniOpen = false));

    for (const server of state.servers) {
        refreshLive(server.id).catch(() => undefined);
    }

    schedulePoll();
    backgroundTimer = setInterval(refreshBackground, BACKGROUND_SECONDS * 1000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.selectedId) {
            refreshLive(state.selectedId);
        }
    });
}

watch(
    () => state.servers.length,
    () => {
        clearInterval(backgroundTimer);
        backgroundTimer = setInterval(refreshBackground, BACKGROUND_SECONDS * 1000);
    },
);

// Actions -------------------------------------------------------------------

export const busy = reactive<Record<string, boolean>>({});

/**
 * Run an action on the open server, after a confirm when asked (and the
 * preference allows), with a toast either way. Returns the result, or null
 * when cancelled.
 */
export async function act(name: string, args: Record<string, unknown> = {}, options: { confirm?: ConfirmRequest; serverId?: string; quiet?: boolean } = {}): Promise<ActionResult | null> {
    const serverId = options.serverId ?? state.selectedId;

    if (!serverId) {
        return null;
    }

    if (options.confirm && state.preferences.confirmActions && !(await confirm(options.confirm))) {
        return null;
    }

    busy[name] = true;

    try {
        const result = await window.panel.server.act(serverId, name, JSON.parse(JSON.stringify(args)));

        if (result.ok) {
            if (!options.quiet) {
                toast('ok', result.summary);
            }
        } else if (!result.errors) {
            toast('error', 'That did not work', result.error);
        }

        state.revision++;
        refreshLive(serverId, true);

        return result;
    } finally {
        busy[name] = false;
    }
}

export async function openMini(): Promise<void> {
    if (state.selectedId) {
        await window.panel.mini.open(state.selectedId);
        state.miniOpen = true;
    }
}

/** Each list page has its own search box, so it starts empty on each. */
watch(
    () => state.view,
    () => {
        state.search = '';
    },
);
