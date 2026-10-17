/**
 * What the tray icon says. The window sends a small summary of its servers
 * whenever a reading changes it (main never reads the servers a second
 * time for this); this keeps that summary to its shape and words it for
 * the tooltip and the right-click menu. No Electron here, so it can be
 * tested on its own.
 */

/** @typedef {'online' | 'offline' | 'locked' | 'unknown'} TrayServerState */
/** @typedef {{ id: string, name: string, state: TrayServerState, players: number, maxPlayers: number }} TrayServer */
/** @typedef {{ selectedId: string | null, servers: TrayServer[] }} TraySummary */

const STATES = ['online', 'offline', 'locked', 'unknown'];

/** Windows caps a tray tooltip at 127 characters. */
const TOOLTIP_MAX = 127;

const count = (value) => Math.min(9999, Math.max(0, Math.round(Number(value) || 0)));
const plural = (amount, one, many) => `${amount} ${amount === 1 ? one : many}`;

/**
 * The window's summary as main trusts it: at most 200 servers, every field
 * its expected type.
 *
 * @returns {TraySummary}
 */
export function cleanSummary(input) {
    const list = Array.isArray(input?.servers) ? input.servers.slice(0, 200) : [];

    return {
        selectedId: typeof input?.selectedId === 'string' && input.selectedId.length <= 64 ? input.selectedId : null,
        servers: list
            .map((server) => ({
                id: String(server?.id ?? '').slice(0, 64),
                name: String(server?.name ?? '').trim().slice(0, 60) || 'Server',
                state: STATES.includes(server?.state) ? server.state : 'unknown',
                players: count(server?.players),
                maxPlayers: count(server?.maxPlayers),
            }))
            .filter((server) => server.id !== ''),
    };
}

/**
 * "2 of 3 servers online · 92 players", for the tooltip and the menu's
 * status line. Before the window's first summary the app is still starting.
 *
 * @param {TraySummary | null} summary
 */
export function statusLine(summary) {
    if (!summary) {
        return 'Starting…';
    }

    if (summary.servers.length === 0) {
        return 'No servers added yet';
    }

    const online = summary.servers.filter((server) => server.state === 'online');
    const players = online.reduce((sum, server) => sum + server.players, 0);

    return `${online.length} of ${plural(summary.servers.length, 'server', 'servers')} online · ${plural(players, 'player', 'players')}`;
}

/** "Wardogs Monitor · 2 of 3 servers online · 92 players". */
export function tooltip(appName, summary) {
    return `${appName} · ${statusLine(summary)}`.slice(0, TOOLTIP_MAX);
}

/**
 * One server in the tray menu: its name and how it is doing. A "&" would
 * underline the next letter in a Windows menu, so it is doubled.
 *
 * @param {TrayServer} server
 */
export function serverLabel(server) {
    const how = {
        online: `${server.players}/${server.maxPlayers} players`,
        offline: 'offline',
        locked: 'locked',
        unknown: 'checking…',
    }[server.state];

    return `${server.name.replaceAll('&', '&&')}  ·  ${how}`;
}
