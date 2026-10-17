import { watch } from 'vue';
import { openOptions, selectServer, state } from '@/lib/store';
import type { TrayServer } from '@/types';

/**
 * The window's side of the tray icon. Main shows a tooltip and menu of the
 * servers but never reads them itself, so the window sends it a small
 * summary, only when something in it changed (not on every poll). Clicks in
 * the tray menu come back here: open a server, or Options → Licence.
 */
export function startTray(): void {
    let sent = '';

    watch(
        () => (state.ready ? summary() : null),
        (value) => {
            const json = JSON.stringify(value);

            if (value && json !== sent) {
                sent = json;
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
    window.panel.tray.onOpenLicence(() => openOptions('licence'));
    window.panel.mini.onOpened(() => (state.miniOpen = true));
}

function summary(): { selectedId: string | null; servers: TrayServer[] } {
    return {
        selectedId: state.selectedId,
        servers: state.servers.map((server) => {
            const live = state.lives[server.id];

            return {
                id: server.id,
                name: server.name,
                state: !live ? 'unknown' : live.locked ? 'locked' : live.online ? 'online' : 'offline',
                players: live?.status?.players ?? 0,
                maxPlayers: live?.status?.maxPlayers ?? 0,
            };
        }),
    };
}
