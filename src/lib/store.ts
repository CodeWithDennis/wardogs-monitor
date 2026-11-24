import { computed, markRaw, reactive, ref, watch } from 'vue';
import type { ActionName, ActionResult, Faction, Limits, Live, LiveStatus, OpenWidget, Player, Preferences, SavedServer } from '@/types';

/** A player who was on a server and is gone now, kept so they can still be banned or watched. */
interface LeftPlayer {
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

function sectionOf(view: View): Section {
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
        railCollapsed: false,
        notifyServerDown: true,
        notifyWatched: true,
        watchlist: [],
        broadcasts: [],
        closeToTray: true,
        minimizeToTray: false,
        startMinimized: false,
        launchAtLogin: false,
        widgets: [],
    } as Preferences,
    limits: null as Limits | null,
    version: '0.0.1',
    selectedPlayer: null as string | null,
    selectedBan: null as string | null,
    search: '',
    addingServer: false,
    editingServer: null as SavedServer | null,
    /** The open widget windows. */
    widgets: [] as OpenWidget[],
    /** The server the widget picker is open for, or null when closed. */
    widgetPicker: null as string | null,
    /** Players who left each server since the app opened, newest first. */
    left: {} as Record<string, LeftPlayer[]>,
    /** The tab Options opens on. */
    optionsTab: 'general',
    paletteOpen: false,
    /** The broadcast dialog is open (for the selected server). */
    broadcasting: false,
    /** The Players view's tab: all, a faction, watched or left. */
    playersTab: 'all',
    /** The players table's sort: which column, and which way. */
    playersSort: { key: 'name', dir: 'asc' } as { key: 'name' | 'kills' | 'deaths' | 'kd' | 'cash' | 'ping'; dir: 'asc' | 'desc' },
    /** Bumped after every action, so lists like bans and activity reload. */
    revision: 0,
});

export const selectedServer = computed(() => state.servers.find((server) => server.id === state.selectedId) ?? null);
export const section = computed(() => sectionOf(state.view));
export const selectedLive = computed(() => (state.selectedId ? state.lives[state.selectedId] : undefined));

/** A clock that ticks every second, for "checked 3s ago". */
export const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | undefined;

// Toasts --------------------------------------------------------------------

export interface Toast {
    id: number;
    kind: 'ok' | 'error' | 'info';
    title: string;
    body?: string;
}

export const toasts = ref<Toast[]>([]);
let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function toast(kind: Toast['kind'], title: string, body?: string): void {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-3), { id, kind, title, body }];
    toastTimers.set(id, setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000));
}

export function dismissToast(id: number): void {
    const timer = toastTimers.get(id);

    if (timer !== undefined) {
        clearTimeout(timer);
        toastTimers.delete(id);
    }

    toasts.value = toasts.value.filter((entry) => entry.id !== id);
}

// Confirm dialog ------------------------------------------------------------

export interface ConfirmRequest {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    /** A second way to go ahead, shown left of the main button (like "Only this server"). */
    alternativeLabel?: string;
}

type ConfirmAnswer = 'confirm' | 'alternative' | null;

export const confirmation = ref<(ConfirmRequest & { resolve: (answer: ConfirmAnswer) => void }) | null>(null);

/** Ask, with two ways to go ahead: 'confirm', 'alternative', or null when cancelled. */
export function choose(request: ConfirmRequest): Promise<ConfirmAnswer> {
    return new Promise((resolve) => {
        confirmation.value?.resolve(null);
        confirmation.value = { ...request, resolve };
    });
}

export async function confirm(request: ConfirmRequest): Promise<boolean> {
    return (await choose(request)) === 'confirm';
}

export function answerConfirm(answer: boolean | 'alternative'): void {
    confirmation.value?.resolve(answer === 'alternative' ? 'alternative' : answer ? 'confirm' : null);
    confirmation.value = null;
}

// Servers and live readings -------------------------------------------------

/** Readings in flight per server, and the newest one asked for, so an older answer never overwrites a newer one. */
const inFlight: Record<string, number> = {};
const newestRequest: Record<string, number> = {};
let requestCount = 0;

export async function refreshLive(serverId: string, force = false): Promise<void> {
    if (state.loading[serverId] && !force) {
        return;
    }

    const request = ++requestCount;
    newestRequest[serverId] = request;
    inFlight[serverId] = (inFlight[serverId] ?? 0) + 1;
    state.loading[serverId] = true;

    try {
        if (force) {
            await window.panel.server.refresh(serverId);
        }

        const answer = await window.panel.server.live(serverId);

        // A refresh was asked for while this one was on its way: its answer is newer.
        if (newestRequest[serverId] !== request) {
            return;
        }

        if (!state.servers.some((server) => server.id === serverId)) {
            return;
        }

        const previous = state.lives[serverId];
        const live = shareUnchanged(previous, answer);
        state.lives[serverId] = live;
        noticeChanges(serverId, previous, live);

        if (live.online && live.status) {
            const points = state.history[serverId] ?? [];
            const next = points.slice(1 - HISTORY_POINTS);
            next.push({ at: Date.now(), players: live.status.players });
            state.history[serverId] = markRaw(next);
        }
    } finally {
        if (Object.hasOwn(inFlight, serverId)) {
            inFlight[serverId] -= 1;
            state.loading[serverId] = inFlight[serverId] > 0;
        }
    }
}

function sameFactions(a: Faction[], b: Faction[]): boolean {
    if (a === b) {
        return true;
    }

    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        const left = a[i];
        const right = b[i];

        if (left.name !== right.name || left.color !== right.color || left.score !== right.score || left.players !== right.players || left.cash !== right.cash) {
            return false;
        }
    }

    return true;
}

function sameStatus(a: LiveStatus, b: LiveStatus): boolean {
    if (a === b) {
        return true;
    }

    if (a.name !== b.name || a.map !== b.map || a.lighting !== b.lighting || a.zone !== b.zone || a.players !== b.players || a.maxPlayers !== b.maxPlayers || a.rotationNow !== b.rotationNow || a.rotationNext !== b.rotationNext) {
        return false;
    }

    const tickA = a.scoreTick;
    const tickB = b.scoreTick;

    if (tickA !== tickB) {
        if (!tickA || !tickB || tickA.current !== tickB.current || tickA.min !== tickB.min || tickA.max !== tickB.max) {
            return false;
        }
    }

    if (a.experiences.length !== b.experiences.length) {
        return false;
    }

    for (let i = 0; i < a.experiences.length; i++) {
        if (a.experiences[i] !== b.experiences[i]) {
            return false;
        }
    }

    return sameFactions(a.factions, b.factions);
}

/**
 * A new reading that keeps the previous one's player objects, status and
 * factions wherever nothing changed. It is never made deeply reactive (it is
 * replaced whole on every reading anyway), and lists and rows that see the
 * same objects as before skip their work.
 */
function shareUnchanged(previous: Live | undefined, next: Live): Live {
    if (!previous) {
        return markRaw(next);
    }

    const before = new Map(previous.players.map((player) => [player.steamId, player]));
    let samePlayers = previous.players.length === next.players.length;
    const players = next.players.map((player, index) => {
        const old = before.get(player.steamId);
        const kept = old && old.name === player.name && old.kills === player.kills && old.deaths === player.deaths && old.cash === player.cash && old.pingMs === player.pingMs && old.faction === player.faction && old.factionColor === player.factionColor ? old : player;
        samePlayers &&= kept === previous.players[index];

        return kept;
    });

    let status = next.status;

    if (status && previous.status) {
        if (sameStatus(previous.status, status)) {
            status = previous.status;
        } else if (sameFactions(previous.status.factions, status.factions)) {
            status = { ...status, factions: previous.status.factions };
        }
    }

    return markRaw({ ...next, status, players: samePlayers ? previous.players : players });
}

/**
 * What changed since the last reading: a server going down or coming back,
 * players leaving (kept in state.left) and watched players joining.
 */
function noticeChanges(serverId: string, previous: Live | undefined, live: Live): void {
    const server = state.servers.find((entry) => entry.id === serverId);

    if (!server || !previous) {
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

    const earlier = state.left[serverId] ?? [];
    const kept = earlier.filter((player) => !now.has(player.steamId) && !gone.some((entry) => entry.steamId === player.steamId));

    // Only a new list when someone left or came back, so the Left tab and the palette are not redone every reading.
    if (gone.length > 0 || kept.length !== earlier.length) {
        state.left[serverId] = [...gone, ...kept].slice(0, LEFT_KEPT);
    }

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

    const clean = (value: string, max: number) => value.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, max);
    const notice = new Notification(clean(title, 120), { body: clean(body, 240) });
    notice.onclick = () => {
        window.panel.focusMain();
        selectServer(serverId);
    };
    notice.onclose = () => {
        notice.onclick = null;
    };
}

let started = false;
let stopPrefs: (() => void) | undefined;
let stopWidgets: (() => void) | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let backgroundTimer: ReturnType<typeof setInterval> | undefined;
const staggerTimers = new Set<ReturnType<typeof setTimeout>>();
let previousRefreshSeconds = 5;

/** How far apart the cards' readings start. */
const STAGGER_MS = 120;

function clearStaggerTimers(): void {
    for (const timer of staggerTimers) {
        clearTimeout(timer);
    }

    staggerTimers.clear();
}

function staggerRefresh(serverId: string, delay: number): void {
    const timer = setTimeout(() => {
        staggerTimers.delete(timer);
        refreshLive(serverId).catch(() => undefined);
    }, delay);

    staggerTimers.add(timer);
}

function onVisible(): void {
    if (!document.hidden && state.selectedId) {
        refreshLive(state.selectedId);
    }
}

function armPoll(): void {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(runPoll, state.preferences.refreshSeconds * 1000);
}

function runPoll(): void {
    if (!document.hidden) {
        if (state.view === 'servers') {
            // Spread over a moment, so many cards update in small steps instead of one big frame.
            const step = Math.min(STAGGER_MS, 1200 / Math.max(1, state.servers.length));

            for (const [index, server] of state.servers.entries()) {
                staggerRefresh(server.id, index * step);
            }
        } else if (state.selectedId) {
            refreshLive(state.selectedId).catch(() => undefined);
        }
    }

    armPoll();
}

function schedulePoll(): void {
    clearStaggerTimers();
    armPoll();
}

function refreshBackground(): void {
    const skipNonSelected = !document.hidden && state.view === 'servers';
    let index = 0;

    for (const server of state.servers) {
        if (skipNonSelected && server.id !== state.selectedId) {
            continue;
        }

        // The open server has its own, faster poll, but that one pauses while
        // the window is hidden (in the tray, or minimised). It is read here
        // then, so its down/back and watched-player alerts still fire.
        if (server.id !== state.selectedId || document.hidden) {
            staggerRefresh(server.id, index * STAGGER_MS);
            index += 1;
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

/** Show or hide the rail's labels; remembered. */
export async function togglePanel(which: 'railCollapsed'): Promise<void> {
    state.preferences = { ...state.preferences, [which]: !state.preferences[which] };
    state.preferences = await window.panel.preferences.set({ [which]: state.preferences[which] });
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
    delete state.left[server.id];
    delete state.loading[server.id];
    delete inFlight[server.id];
    delete newestRequest[server.id];

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
    if (started) {
        return;
    }

    started = true;

    const [preferences, limits, info] = await Promise.all([window.panel.preferences.get(), window.panel.limits(), window.panel.appInfo()]);
    state.preferences = preferences;
    state.limits = limits;
    state.version = info.version;
    previousRefreshSeconds = preferences.refreshSeconds;
    await loadServers();
    // One server opens straight on its controls; several start on the cards.
    state.view = state.servers.length === 1 ? 'overview' : 'servers';
    state.ready = true;

    stopPrefs = window.panel.preferences.onChange((next) => {
        const refreshChanged = next.refreshSeconds !== previousRefreshSeconds;
        previousRefreshSeconds = next.refreshSeconds;
        state.preferences = next;

        if (refreshChanged) {
            schedulePoll();
        }
    });
    state.widgets = await window.panel.widgets.list();
    stopWidgets = window.panel.widgets.onChange((widgets) => (state.widgets = widgets));

    for (const server of state.servers) {
        refreshLive(server.id).catch(() => undefined);
    }

    nowTimer = setInterval(() => (now.value = Date.now()), 1000);
    schedulePoll();
    backgroundTimer = setInterval(refreshBackground, BACKGROUND_SECONDS * 1000);
    document.addEventListener('visibilitychange', onVisible);

    watch(
        () => state.servers.length,
        () => {
            clearInterval(backgroundTimer);
            backgroundTimer = setInterval(refreshBackground, BACKGROUND_SECONDS * 1000);
        },
    );
}

// Actions -------------------------------------------------------------------

export const busy = reactive<Partial<Record<ActionName, boolean>>>({});

/** Steam IDs of players being kicked or banned right now, shown fading out. */
export const leaving = reactive(new Set<string>());

/**
 * Run an action on the open server, after a confirm when asked (and the
 * preference allows), with a toast either way. Returns the result, or null
 * when cancelled.
 */
export async function act(name: ActionName, args: Record<string, unknown> = {}, options: { confirm?: ConfirmRequest; serverId?: string; quiet?: boolean } = {}): Promise<ActionResult | null> {
    const serverId = options.serverId ?? state.selectedId;

    if (!serverId) {
        return null;
    }

    if (options.confirm && state.preferences.confirmActions && !(await confirm(options.confirm))) {
        return null;
    }

    busy[name] = true;

    // A kicked or banned player fades out at once; they come back if it fails.
    const removing = (name === 'kick' || name === 'ban') && typeof args.steamId === 'string' ? args.steamId.trim() : null;
    let succeeded = false;

    if (removing) {
        leaving.add(removing);
    }

    try {
        const result = await window.panel.server.act(serverId, name, JSON.parse(JSON.stringify(args)));
        succeeded = result.ok;

        if (result.ok) {
            if (!options.quiet) {
                toast('ok', result.summary);
            }
        } else if (!result.errors) {
            toast('error', 'That did not work', result.error);
        }

        state.revision++;
        const refreshed = refreshLive(serverId, true);

        if (removing && result.ok) {
            // Gone from the list with the next reading; until then it stays faded.
            refreshed.catch(() => undefined).then(() => leaving.delete(removing));
        }

        return result;
    } finally {
        if (Object.hasOwn(busy, name)) {
            busy[name] = false;
        }

        if (removing && !succeeded) {
            leaving.delete(removing);
        }
    }
}

/** Each list page has its own search box, so it starts empty on each. */
watch(
    () => state.view,
    () => {
        state.search = '';
    },
);

/** How often, at most, a list filters again while someone types. */
const SEARCH_SETTLE_MS = 120;

/**
 * The search the lists filter by: trimmed and in lower case. The first key
 * filters at once; while typing on, the lists follow at most every 120 ms
 * (and once more for the last key), so a long list never filters on every
 * key. Clearing is instant.
 */
export const searchTerm = ref('');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => state.search,
    () => {
        const apply = () => (searchTerm.value = state.search.trim().toLowerCase());

        if (state.search === '') {
            clearTimeout(searchTimer ?? undefined);
            searchTimer = null;
            apply();
        } else if (!searchTimer) {
            apply();
            searchTimer = setTimeout(function settle() {
                const before = searchTerm.value;
                apply();
                searchTimer = before === searchTerm.value ? null : setTimeout(settle, SEARCH_SETTLE_MS);
            }, SEARCH_SETTLE_MS);
        }
    },
);
