import { watch } from 'vue';
import { selectServer, state } from '@/lib/store';
import type { TrayServer } from '@/types';

/**
 * The window's side of the tray icon. Main shows a tooltip and menu of the
 * servers but never reads them itself, so the window sends it a small
 * summary, only when something in it changed (not on every poll). Clicks in
 * the tray menu come back here to open a server.
 */
let started = false;

export function startTray(): void {
    if (started) {
        return;
    }

    started = true;
    let sent = '';

    watch(
        () => (state.ready ? summary() : null),
        (value) => {
            const key = value ? `${value.selectedId ?? ''}|${value.servers.map((server) => `${server.id}:${server.name}:${server.state}:${server.players}:${server.maxPlayers}`).join('|')}` : '';

            if (value && key !== sent) {
                sent = key;
                window.panel.tray.summary(value);
            }
        },
        { immediate: true },
    );

    window.panel.tray.onOpenServer((serverId) => {
        if (state.servers.some((server) => server.id === serverId)) {
            selectServer(serverId);
        }
    });
}

function summary(): { selectedId: string | null; servers: TrayServer[] } {
    return {
        selectedId: state.selectedId,
        servers: state.servers.map((server) => {
            const live = state.lives[server.id];

            return {
                id: server.id,
                name: server.name,
                state: !live ? 'unknown' : live.online ? 'online' : 'offline',
                players: live?.status?.players ?? 0,
                maxPlayers: live?.status?.maxPlayers ?? 0,
            };
        }),
    };
}
