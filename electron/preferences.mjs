import { cleanWidgets } from './widgets.mjs';

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

/** Midnight with gold: the boot screen's colours before any theme was seen. */
export const DEFAULT_BOOT_COLORS = { bg: '#0e1222', text: '#ebe6d8', muted: '#868ba3', accent: '#e8b54e' };

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
    notifyServerDown: true,
    notifyWatched: true,
    /** Players to keep an eye on: { steamId, name, note, addedAt }. */
    watchlist: [],
    broadcasts: DEFAULT_BROADCASTS,
    /** The window's close button hides it to the tray; the app keeps watching. */
    closeToTray: true,
    /** Minimising hides the window to the tray instead of the taskbar. */
    minimizeToTray: false,
    /** Open hidden in the tray instead of showing the window. */
    startMinimized: false,
    /** Start with Windows, hidden in the tray. */
    launchAtLogin: false,
    /** The open widgets and where they sit, so they reopen on the next start (see widgets.mjs). */
    widgets: [],
    /** Whether the one-off "still running in the tray" notice was shown. */
    trayNoticeShown: false,
    /**
     * The open theme's colours, remembered so the next start paints the
     * window and boot screen in them from the first frame: the theme itself
     * only reaches the page once its scripts have run.
     */
    bootColors: DEFAULT_BOOT_COLORS,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Boot colours kept to their shape: each a #rrggbb colour, or the default. */
export function cleanBootColors(value) {
    return Object.fromEntries(Object.entries(DEFAULT_BOOT_COLORS).map(([key, fallback]) => [key, HEX.test(String(value?.[key] ?? '')) ? String(value[key]).toLowerCase() : fallback]));
}

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

    for (const key of ['closeToTray', 'minimizeToTray', 'startMinimized', 'launchAtLogin', 'trayNoticeShown']) {
        next[key] = typeof next[key] === 'boolean' ? next[key] : DEFAULT_PREFERENCES[key];
    }

    next.bootColors = cleanBootColors(next.bootColors);
    next.widgets = cleanWidgets(next.widgets);

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
