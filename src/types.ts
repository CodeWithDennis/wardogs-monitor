export interface SavedServer {
    id: string;
    name: string;
    host: string;
    port: number;
    demo: boolean;
}

export interface Faction {
    name: string;
    color: string;
    score: number;
    players: number;
    cash: number;
}

export interface Player {
    name: string;
    steamId: string;
    faction: string | null;
    factionColor: string | null;
    kills: number;
    deaths: number;
    cash: number;
    pingMs: number;
}

export interface LiveStatus {
    name: string;
    map: string;
    experiences: string[];
    lighting: string | null;
    zone: string | null;
    players: number;
    maxPlayers: number;
    factions: Faction[];
    scoreTick: { current: number; min: number; max: number } | null;
    rotationNow: number | null;
    rotationNext: number | null;
}

export interface Live {
    online: boolean;
    error: string | null;
    checkedAt: string;
    status: LiveStatus | null;
    players: Player[];
    uptimeSeconds: number | null;
}

export interface Ban {
    steamId: string;
    bannedAt: string | null;
    bannedBy: string | null;
    reason: string | null;
}

export interface BansAnswer {
    error: string | null;
    bans: Ban[];
}

export interface RotationEntry {
    map: string;
    experiences: string[];
    lighting: string | null;
    zone: string | null;
}

export interface LiveRotationEntry extends RotationEntry {
    index: number;
    status: string | null;
    denied: boolean;
}

export interface RotationAnswer {
    error: string | null;
    enabled: boolean;
    mode: string | null;
    entries: LiveRotationEntry[];
}

export interface Named {
    id: string;
    name: string;
}

export interface CatalogMap extends Named {
    modes: Named[];
    modifiers: Named[];
    zones: Named[];
}

export interface Catalog {
    error: string | null;
    maps: CatalogMap[];
    lightings: Named[];
}

export interface ServerSettings {
    server_password: string;
    min_cash: number;
    max_cash: number;
    min_level: number;
    max_level: number;
    image_url: string;
    max_reserved_slots: number;
    max_players: number;
    min_players_to_start: number;
    score_period: number;
    lock_overpopulated_teams: boolean;
    overpopulated_team_threshold: number;
    reserved_steam_ids: string[];
    server_name: string;
    server_name_locked: boolean;
}

export interface SettingsAnswer {
    error: string | null;
    revision: string | null;
    writable: boolean;
    settings: ServerSettings | null;
    rotation: { enabled: boolean; mode: string; entries: RotationEntry[] } | null;
}

export interface Limits {
    rotationModes: string[];
    maxRotationEntries: number;
    scorePeriodMin: number;
    scorePeriodMax: number;
    passwordMax: number;
    maxReservedIds: number;
    maxPlayersMin: number;
    maxPlayersMax: number;
    teamLeadMax: number;
    levelMax: number;
    cashMax: number;
}

export type ActionName = 'broadcast' | 'message' | 'kick' | 'kill' | 'faction' | 'ban' | 'unban' | 'endMatch' | 'restartMatch' | 'changeMap' | 'saveSettings' | 'saveRotation';

export type ActionResult =
    | { ok: true; summary: string }
    | { ok: false; error: string; errors?: Record<string, string>; configChanged?: boolean };

export interface ActivityEntry {
    at: string;
    serverId: string;
    serverName: string;
    action: string;
    summary: string;
    ok: boolean;
    error?: string;
}

/** Servers linked to share one ban list; the list itself is kept on this PC. */
export interface BanGroup {
    id: string;
    name: string;
    serverIds: string[];
    /** Bans on the shared list as of the last sync or ban through the app. */
    banCount: number;
    /** Bans lifted through the app that a sync lifts everywhere. */
    liftedCount: number;
    createdAt: string;
    lastSyncedAt: string | null;
}

export interface SharedBan {
    steamId: string;
    reason: string | null;
    bannedAt: string | null;
    bannedBy?: string | null;
    sourceServerId?: string | null;
}

/** What a sync would change, per server. Reading it changes nothing. */
export interface BanSyncPlan {
    groupId: string;
    groupName: string;
    sharedCount: number;
    servers: { serverId: string; serverName: string; toAdd: SharedBan[]; toRemove: { steamId: string; removedAt: string }[] }[];
    skipped: { serverId: string; serverName: string; reason: string }[];
    missing: number;
    lifting: number;
    serversBehind: number;
    fingerprint: string;
    checkedAt: string;
}

export interface BanSyncSummary {
    ok: true;
    groupId: string;
    groupName: string;
    servers: { serverId: string; serverName: string; added: number; removed: number; failures: { kind: 'add' | 'remove'; steamId: string; error: string }[] }[];
    skipped: { serverId: string; serverName: string; reason: string }[];
    added: number;
    removed: number;
    failed: number;
}

export interface WatchedPlayer {
    steamId: string;
    name: string;
    note: string;
    addedAt: string;
}

export interface Preferences {
    refreshSeconds: number;
    confirmActions: boolean;
    miniOpacity: number;
    miniAlwaysOnTop: boolean;
    lastServerId: string | null;
    theme: string;
    accent: string;
    zoom: number;
    miniZoom: number;
    railCollapsed: boolean;
    notifyServerDown: boolean;
    notifyWatched: boolean;
    watchlist: WatchedPlayer[];
    broadcasts: string[];
    /** The window's X hides it to the tray instead of quitting. */
    closeToTray: boolean;
    /** Minimising hides the window to the tray instead of the taskbar. */
    minimizeToTray: boolean;
    /** Open hidden in the tray. */
    startMinimized: boolean;
    /** Start with Windows, hidden in the tray. */
    launchAtLogin: boolean;
    /** The open widgets and where they sit (main keeps this list). */
    widgets: (OpenWidget & { bounds: { x: number; y: number; width: number; height: number } | null })[];
}

/** What a widget shows (electron/widgets.mjs). */
export type WidgetKind = 'status' | 'score' | 'players' | 'actions';

/** An open widget window: one kind, on one server. */
export interface OpenWidget {
    id: string;
    kind: WidgetKind;
    serverId: string;
}

/** What every widget gets from its window: the server online, with its latest reading. */
export interface WidgetProps {
    serverId: string;
    live: Live;
    status: LiveStatus;
    /** What the rotation plays next, for the status widget. */
    next: string | null;
    preferences: Preferences;
}

/** The open theme's colours, which the next start paints its first frame in. */
export interface BootColors {
    bg: string;
    text: string;
    muted: string;
    accent: string;
}

/** One server as the tray icon's tooltip and menu show it. */
export interface TrayServer {
    id: string;
    name: string;
    state: 'online' | 'offline' | 'unknown';
    players: number;
    maxPlayers: number;
}

export interface PanelApi {
    servers: {
        list(): Promise<SavedServer[]>;
        save(input: { id?: string; name: string; host: string; port: number; password?: string }): Promise<{ ok: true; server: SavedServer } | { ok: false; error: string }>;
        remove(id: string): Promise<void>;
        reorder(ids: string[]): Promise<void>;
        addDemo(): Promise<SavedServer>;
    };
    server: {
        live(id: string): Promise<Live>;
        bans(id: string): Promise<BansAnswer>;
        rotation(id: string): Promise<RotationAnswer>;
        catalog(id: string): Promise<Catalog>;
        identity(id: string): Promise<{ serverId: string | null; bannerUrl: string | null }>;
        settings(id: string): Promise<SettingsAnswer>;
        act(id: string, name: ActionName, args?: Record<string, unknown>): Promise<ActionResult>;
        refresh(id: string): Promise<void>;
    };
    activity: { list(serverId?: string | null): Promise<ActivityEntry[]> };
    banLists: {
        list(): Promise<BanGroup[]>;
        save(input: { id?: string; name?: string; serverIds?: string[] }): Promise<{ ok: true; group: BanGroup } | { ok: false; error: string }>;
        remove(id: string): Promise<void>;
        plan(groupId: string): Promise<{ ok: true; plan: BanSyncPlan } | { ok: false; error: string }>;
        /** Writes only when `fingerprint` matches a fresh plan; otherwise hands that plan back. */
        sync(groupId: string, fingerprint: string): Promise<BanSyncSummary | { ok: false; error: string; changed?: boolean; plan?: BanSyncPlan }>;
    };
    preferences: {
        get(): Promise<Preferences>;
        set(changes: Partial<Preferences>): Promise<Preferences>;
        onChange(callback: (preferences: Preferences) => void): () => void;
    };
    setZoom(factor: number): Promise<void>;
    limits(): Promise<Limits>;
    appInfo(): Promise<{ version: string; dataPath: string }>;
    widgets: {
        open(kind: WidgetKind, serverId: string): Promise<void>;
        /** Close a widget by ID; from inside a widget, without one, that widget. */
        close(id?: string): Promise<void>;
        list(): Promise<OpenWidget[]>;
        /** The open widgets changed, maybe from the tray menu or a widget's own close button. */
        onChange(callback: (widgets: OpenWidget[]) => void): () => void;
    };
    /** Show the main window, from the tray or minimised if need be. */
    focusMain(): Promise<void>;
    openExternal(url: string): Promise<void>;
    rememberBootColors(colors: BootColors): Promise<void>;
    tray: {
        summary(value: { selectedId: string | null; servers: TrayServer[] }): void;
        onOpenServer(callback: (serverId: string) => void): () => void;
    };
}

declare global {
    interface Window {
        panel: PanelApi;
    }
}
