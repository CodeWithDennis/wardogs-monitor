/**
 * Widgets: small always-on-top windows, each showing one thing about one
 * server (its status, the score race, the top players, or quick actions).
 * Any number can be open at once; the open ones are remembered with where
 * they sat and reopen on the next start. No Electron here, so it can be
 * tested on its own.
 */

/** @typedef {'status' | 'score' | 'players' | 'actions'} WidgetKind */
/** @typedef {{ x: number, y: number, width: number, height: number }} Bounds */
/** @typedef {{ id: string, kind: WidgetKind, serverId: string, bounds: Bounds | null }} SavedWidget */

/** @type {Record<WidgetKind, { title: string, size: { width: number, height: number }, min: { width: number, height: number } }>} */
export const WIDGET_KINDS = {
    status: { title: 'Status', size: { width: 420, height: 330 }, min: { width: 340, height: 220 } },
    score: { title: 'Score', size: { width: 380, height: 300 }, min: { width: 300, height: 220 } },
    players: { title: 'Top players', size: { width: 360, height: 430 }, min: { width: 290, height: 240 } },
    actions: { title: 'Quick actions', size: { width: 360, height: 400 }, min: { width: 300, height: 260 } },
};

/** Never more open than this, so a stored list can't open a wall of windows. */
export const MAX_WIDGETS = 12;

export const isWidgetKind = (value) => Object.hasOwn(WIDGET_KINDS, String(value));

const whole = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);

/** @returns {Bounds | null} */
function cleanBounds(value) {
    const bounds = { x: whole(value?.x), y: whole(value?.y), width: whole(value?.width), height: whole(value?.height) };

    return Object.values(bounds).every((part) => part !== null) && bounds.width > 0 && bounds.height > 0 ? /** @type {Bounds} */ (bounds) : null;
}

/**
 * The stored widgets kept to their shape: known kinds only, one per kind
 * and server, at most MAX_WIDGETS.
 *
 * @returns {SavedWidget[]}
 */
export function cleanWidgets(value) {
    const seen = new Set();

    return (Array.isArray(value) ? value : [])
        .filter((entry) => typeof entry?.id === 'string' && entry.id.length > 0 && entry.id.length <= 64 && isWidgetKind(entry.kind) && typeof entry.serverId === 'string' && entry.serverId.length > 0)
        .filter((entry) => {
            const key = `${entry.kind}:${entry.serverId}`;
            const fresh = !seen.has(key) && !seen.has(entry.id);
            seen.add(key);
            seen.add(entry.id);

            return fresh;
        })
        .slice(0, MAX_WIDGETS)
        .map((entry) => ({ id: entry.id, kind: entry.kind, serverId: entry.serverId, bounds: cleanBounds(entry.bounds) }));
}

/**
 * Where a new widget opens: near the top right of the screen, each one a
 * step down and left of the last so none hides another.
 *
 * @param {WidgetKind} kind
 * @param {{ x: number, y: number, width: number, height: number }} area The screen's work area.
 * @param {number} open How many widgets are open already.
 * @returns {Bounds}
 */
export function placeWidget(kind, area, open) {
    const { width, height } = WIDGET_KINDS[kind].size;
    const step = (open % 8) * 32;

    return {
        x: Math.max(area.x, area.x + area.width - width - 20 - step),
        y: Math.min(area.y + 80 + step, Math.max(area.y, area.y + area.height - height)),
        width: Math.min(width, area.width),
        height: Math.min(height, area.height),
    };
}

/**
 * Whether saved bounds still land on a screen (a monitor may have gone):
 * enough of the window's top must sit in some work area to grab it.
 *
 * @param {Bounds} bounds
 * @param {{ x: number, y: number, width: number, height: number }[]} areas
 */
export function onScreen(bounds, areas) {
    return areas.some((area) => bounds.x + bounds.width - 60 > area.x && bounds.x + 60 < area.x + area.width && bounds.y >= area.y - 10 && bounds.y + 30 < area.y + area.height);
}
