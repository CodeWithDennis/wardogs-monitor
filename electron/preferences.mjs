/**
 * The app's preferences: their defaults, and how what is stored becomes
 * what the app uses. Only what someone set is stored, so a default that
 * changes in an update reaches everyone who never picked otherwise.
 * No Electron here, so it can be tested on its own.
 */

export const DEFAULT_BROADCASTS = [
    'Server restarts in 5 minutes. Finish your fights!',
    'Join our Discord for events and news.',
    'Please keep voice chat friendly. Staff are watching.',
    'Event starting soon. Hold your positions.',
];

/** Zoom steps, like a browser's. */
export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export const DEFAULT_PREFERENCES = {
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
    sidebarCollapsed: false,
    /** The right-hand detail panel folded to a thin strip. */
    detailCollapsed: false,
    /** The headline font (see src/lib/themes.ts FONTS). */
    titleFont: 'barlow-condensed',
    notifyServerDown: true,
    notifyWatched: true,
    /** Players to keep an eye on: { steamId, name, note, addedAt }. */
    watchlist: [],
    broadcasts: DEFAULT_BROADCASTS,
};

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const nearestZoom = (value) => ZOOM_STEPS.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best), 1);

/**
 * The layout's own sizes changed in this version: 100% now looks like the
 * old 110%. Zoom saved before that would come out too big, so it resets.
 */
export const LAYOUT_VERSION = 2;

/**
 * What is stored, as it counts. Version 0.1.0 saved every value, the
 * default theme included, so a stored theme and accent only count once
 * someone picked one (appearanceChosen). Zoom saved for the old, smaller
 * layout starts over (LAYOUT_VERSION).
 *
 * @param {Record<string, unknown>} raw
 */
export function readable(raw) {
    const copy = { ...raw };

    if (!copy.appearanceChosen) {
        delete copy.theme;
        delete copy.accent;
    }

    if ((Number(copy.layoutVersion) || 1) < LAYOUT_VERSION) {
        delete copy.zoom;
        delete copy.miniZoom;
    }

    return copy;
}

/** Every preference, defaults filled in and values kept to their shapes. */
export function resolve(raw) {
    const next = { ...DEFAULT_PREFERENCES, ...readable(raw) };

    next.refreshSeconds = Math.min(60, Math.max(2, Math.round(Number(next.refreshSeconds) || DEFAULT_PREFERENCES.refreshSeconds)));
    next.miniOpacity = Math.min(1, Math.max(0.5, Number(next.miniOpacity) || DEFAULT_PREFERENCES.miniOpacity));
    next.watchlist = (Array.isArray(next.watchlist) ? next.watchlist : [])
        .filter((entry) => /^\d{17}$/.test(String(entry?.steamId ?? '')))
        .slice(0, 500)
        .map((entry) => ({ steamId: String(entry.steamId), name: text(entry.name, 64), note: text(entry.note, 200), addedAt: text(entry.addedAt, 40) || new Date().toISOString() }));
    next.broadcasts = (Array.isArray(next.broadcasts) ? next.broadcasts : DEFAULT_BROADCASTS).map((entry) => text(entry, 200)).filter(Boolean).slice(0, 30);
    next.zoom = nearestZoom(Number(next.zoom) || 1);
    next.miniZoom = nearestZoom(Number(next.miniZoom) || 1);

    return next;
}

/**
 * Apply changes to what is stored: returns what to write back (only the
 * keys someone set) and the preferences the app now uses.
 *
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown>} changes
 */
export function change(raw, changes) {
    const kept = { ...readable(raw), ...changes };

    if ('theme' in changes || 'accent' in changes) {
        kept.appearanceChosen = true;
    }

    kept.layoutVersion = LAYOUT_VERSION;

    const preferences = resolve(kept);
    const toStore = Object.fromEntries(Object.keys(kept).map((key) => [key, key in preferences ? preferences[key] : kept[key]]));

    return { toStore, preferences };
}
