import { state } from '@/lib/store';
import type { WidgetKind } from '@/types';

export { WIDGETS } from '@/lib/widgetMeta';

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
