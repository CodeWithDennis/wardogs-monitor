import { Activity, Swords, Trophy, Zap } from 'lucide-vue-next';
import type { Component } from 'vue';
import { state } from '@/lib/store';
import type { WidgetKind } from '@/types';

/**
 * The widgets, as the main window offers them: small always-on-top windows
 * (electron/widgets.mjs) showing one thing about one server. Any number can
 * be open at once, one of each kind per server.
 */
export const WIDGETS: { kind: WidgetKind; label: string; description: string; icon: Component }[] = [
    { kind: 'status', label: 'Status', description: 'Map, mode, score race and player count at a glance.', icon: Activity },
    { kind: 'score', label: 'Score', description: 'The faction race to 100, big enough to read over the game.', icon: Swords },
    { kind: 'players', label: 'Top players', description: 'The leaderboard by kills, with deaths and K/D.', icon: Trophy },
    { kind: 'actions', label: 'Quick actions', description: 'Broadcast, restart or end the match without opening the app.', icon: Zap },
];

export const widgetLabel = (kind: WidgetKind): string => WIDGETS.find((widget) => widget.kind === kind)?.label ?? 'Widget';

/** The open widget of a kind on a server, if there is one. */
export const openWidgetOf = (kind: WidgetKind, serverId: string | null) => state.widgets.find((widget) => widget.kind === kind && widget.serverId === serverId) ?? null;

/** How many widgets are open on a server. */
export const widgetCount = (serverId: string | null): number => state.widgets.filter((widget) => widget.serverId === serverId).length;

/** Open a widget (or bring it forward when it is open already). */
export function openWidget(kind: WidgetKind, serverId: string | null = state.selectedId): void {
    if (serverId) {
        window.panel.widgets.open(kind, serverId);
    }
}

/** Open or close a widget, from the picker. */
export function toggleWidget(kind: WidgetKind, serverId: string): void {
    const open = openWidgetOf(kind, serverId);

    if (open) {
        window.panel.widgets.close(open.id);
    } else {
        openWidget(kind, serverId);
    }
}

/** Show the widget picker for a server (the selected one by default). */
export function pickWidgets(serverId: string | null = state.selectedId): void {
    state.widgetPicker = serverId;
}
