import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, screen, shell, Tray } from 'electron';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import brand from '../brand.json' with { type: 'json' };
import { startMockServer } from '../mock/wardogs-mock.mjs';
import { LIMITS } from './config.mjs';
import { dropServer, removeGroup, saveGroup } from './banlists.mjs';
import { act, banListPlan, banListSync, bans, catalog, clearCache, identity, live, probe, readSettings, rotation } from './service.mjs';
import { cleanBootColors } from './preferences.mjs';
import { activity, banLists, preferences, servers, ZOOM_STEPS } from './store.mjs';
import { cleanSummary, serverLabel, statusLine, tooltip } from './tray-status.mjs';
import { isWidgetKind, MAX_WIDGETS, onScreen, placeWidget, WIDGET_KINDS } from './widgets.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// The Vite dev server in development only: a packaged app always loads its own files.
const devServer = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
const ICON = path.join(here, '..', 'build', 'icon.png');
/** 16 px, with @1.25x … @3x siblings Electron picks up for scaled displays (scripts/make-icon.mjs). */
const TRAY_ICON = path.join(here, '..', 'build', 'tray', 'tray.png');

/**
 * Switches for screenshot runs and tests (PANEL_USER_DATA, PANEL_SCREENSHOTS,
 * PANEL_CLICKTEST, PANEL_TRAYTEST). Only an app started from the source
 * reads them: a packaged app ignores them, so none can be used to change how
 * an installed copy behaves.
 */
const testSwitch = (name) => (app.isPackaged ? undefined : process.env[name]);

// Screenshots and tests run against their own data folder, never the real one.
if (testSwitch('PANEL_USER_DATA')) {
    app.setPath('userData', testSwitch('PANEL_USER_DATA'));
} else {
    // A data folder that stays put whatever the product is called; saved
    // servers, preferences and the log come along from an older name once.
    const dataFolder = path.join(app.getPath('appData'), brand.dataFolder);

    if (!existsSync(path.join(dataFolder, 'servers.json'))) {
        for (const previous of brand.previousDataFolders) {
            const from = path.join(app.getPath('appData'), previous);

            if (existsSync(path.join(from, 'servers.json'))) {
                for (const file of ['servers.json', 'preferences.json', 'banlists.json', 'activity.log']) {
                    if (existsSync(path.join(from, file))) {
                        cpSync(path.join(from, file), path.join(dataFolder, file));
                    }
                }

                break;
            }
        }
    }

    app.setPath('userData', dataFolder);
}

app.setAppUserModelId(brand.appId);
nativeTheme.themeSource = 'dark';

// No menu bar: its zoom-in shortcut wants Ctrl+Shift+=, so Ctrl+= never
// zoomed in. The app handles its own shortcuts (see attachZoom).
Menu.setApplicationMenu(null);

// In the tray the window is hidden, and Chromium slows a hidden page's
// timers to once a minute after five minutes. The window keeps reading the
// servers every 30 seconds while hidden so down/back and watched-player
// alerts stay timely, so that extra slowdown is switched off.
app.commandLine.appendSwitch('disable-features', 'IntensiveWakeUpThrottling');

// Screenshot runs capture a window that may sit behind others; keep it painting and animating there.
if (testSwitch('PANEL_SCREENSHOTS')) {
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** The open widget windows, by widget ID (see openWidget). @type {Map<string, BrowserWindow>} */
const widgetWindows = new Map();
/** Tracks each widget webContents ID so IPC handlers can enforce least privilege. @type {Map<number, { id: string, kind: string, serverId: string }>} */
const widgetSenders = new Map();
/** @type {{ port: number, password: string, close: () => Promise<void> } | null} */
let demo = null;
/** Saved servers are listed only once the demo server (if any) is up and its port saved. */
let demoReady = Promise.resolve();

/**
 * The preferences as last saved, kept here so window events (close,
 * minimise) can read them on the spot: they cannot wait for a file read.
 *
 * @type {Record<string, any>}
 */
let prefs = {};

/** Set once the app is really quitting, so closing the window then closes it instead of hiding it to the tray. */
let isQuitting = false;
/** Ban-list syncs running now: quitting asks first, as stopping one part-way leaves servers out of step. */
let banSyncsRunning = 0;
let quitDuringSync = false;
let askingToQuit = false;

/** @type {Tray | null} */
let tray = null;
/** @type {import('./tray-status.mjs').TraySummary | null} */
let traySummary = null;
/** The last notification main showed, kept so its click handler is not garbage-collected. */
let notice = null;
/** When the window last lost focus: clicking the tray icon takes focus away first. */
let lastBlurAt = 0;
/** Started hidden while maximised: maximise on first show (maximising a hidden window shows it). */
let maximizeOnShow = false;

let preferenceQueue = Promise.resolve();

/**
 * Save preference changes and keep the copy above current. Saves run one
 * after another; `changes` may be a function of the latest preferences,
 * for changes built from what is saved (like the list of widgets).
 *
 * @param {Record<string, any> | ((current: Record<string, any>) => Record<string, any>)} changes
 */
function savePreferences(changes) {
    const run = preferenceQueue.then(async () => {
        prefs = await preferences.set(typeof changes === 'function' ? changes(prefs) : changes);

        return prefs;
    });
    preferenceQueue = run.catch(() => undefined);

    return run;
}

/**
 * Load the page at a view. The main window also gets the theme's colours
 * in the address, which public/boot.js paints the boot screen with before
 * anything else runs.
 */
function load(window, view, query = {}) {
    if (devServer) {
        const search = new URLSearchParams(query).toString();
        window.loadURL(`${devServer}${search ? `?${search}` : ''}#${view}`);
    } else {
        window.loadFile(path.join(here, '..', 'dist', 'index.html'), { hash: view, query });
    }
}

/** Keep every window on the app's own pages; links open in the real browser. */
function lockDown(window) {
    window.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url);

        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
        if (!devServer || !url.startsWith(devServer)) {
            event.preventDefault();
        }
    });
}

/** Safely send an IPC event to every live window. */
function broadcast(channel, value) {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send(channel, value);
        }
    }
}

/** Only Steam profiles/IDs and the product's website open outside the app. */
function openExternal(url) {
    try {
        const parsed = new URL(url);
        const website = brand.website ? new URL(brand.website).hostname : null;

        if (parsed.protocol !== 'https:') {
            return;
        }

        const isSteamProfile = parsed.hostname === 'steamcommunity.com'
            && /^\/(profiles\/\d{17}|id\/[A-Za-z0-9_-]{1,64})\/?$/.test(parsed.pathname)
            && parsed.search === ''
            && parsed.hash === '';

        if (isSteamProfile || (website && parsed.hostname === website)) {
            shell.openExternal(parsed.toString());
        }
    } catch {
        // Not a link.
    }
}

/**
 * Zoom like a browser: Ctrl + / Ctrl = and Ctrl - (also on the number pad),
 * Ctrl 0 to reset, and Ctrl + mouse wheel. Each window remembers its zoom.
 * `onZoom` hears every factor set, the saved one on load included.
 */
function attachZoom(window, key, onZoom = () => {}) {
    const apply = async (factor) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) {
            return;
        }

        window.webContents.setZoomFactor(factor);
        onZoom(factor);
        const next = await savePreferences({ [key]: factor });
        broadcast('preferences:changed', next);
    };

    const step = (direction) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) {
            return;
        }

        const current = window.webContents.getZoomFactor();
        const index = ZOOM_STEPS.findIndex((value) => value >= current - 0.001);
        const at = index === -1 ? ZOOM_STEPS.length - 1 : index;
        apply(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + direction))]);
    };

    window.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) {
            return;
        }

        if (['=', '+'].includes(input.key) || input.code === 'NumpadAdd') {
            event.preventDefault();
            step(1);
        } else if (['-', '_'].includes(input.key) || input.code === 'NumpadSubtract') {
            event.preventDefault();
            step(-1);
        } else if (input.key === '0' || input.code === 'Numpad0') {
            event.preventDefault();
            apply(1);
        }
    });

    window.webContents.on('zoom-changed', (_event, direction) => step(direction === 'in' ? 1 : -1));

    window.webContents.on('did-finish-load', async () => {
        const factor = (await preferences.get())[key] ?? 1;

        if (window.isDestroyed() || window.webContents.isDestroyed()) {
            return;
        }

        window.webContents.setZoomFactor(factor);
        onZoom(factor);
    });

    return apply;
}

/** @type {Record<string, (factor: number) => void>} */
const zoomers = {};

/**
 * The smallest main window, in page pixels: the rail, the full sidebar, a
 * page and the detail panel side by side, with nothing squeezed. Zooming in
 * makes page pixels bigger, so the window's minimum grows with the zoom
 * (never past the screen it is on).
 */
const MAIN_MINIMUM = { width: 1360, height: 640 };

function fitMinimumSize(window, factor) {
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const width = Math.min(area.width, Math.round(MAIN_MINIMUM.width * factor));
    const height = Math.min(area.height, Math.round(MAIN_MINIMUM.height * factor));
    window.setMinimumSize(width, height);

    if (!window.isMaximized() && !window.isFullScreen()) {
        const [currentWidth, currentHeight] = window.getSize();

        if (currentWidth < width || currentHeight < height) {
            window.setSize(Math.max(currentWidth, width), Math.max(currentHeight, height));
        }
    }
}

const webPreferences = {
    preload: path.join(here, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
};

/**
 * The main window. It shows straight away, on the theme's own background,
 * and the page paints its boot screen from the first frame (index.html),
 * so there is no white flash and no blank wait while the scripts load.
 * Starting in the tray, it loads hidden and the page polls as usual, so
 * alerts work before it is ever opened.
 */
function createMainWindow({ hidden }) {
    const area = screen.getPrimaryDisplay().workArea;
    const bounds = prefs.windowBounds && screen.getDisplayMatching(prefs.windowBounds) ? prefs.windowBounds : { width: Math.min(1500, area.width - 40), height: Math.min(920, area.height - 40) };
    const colors = prefs.bootColors;

    mainWindow = new BrowserWindow({
        ...bounds,
        minWidth: Math.min(area.width, MAIN_MINIMUM.width),
        minHeight: Math.min(area.height, MAIN_MINIMUM.height),
        show: false,
        backgroundColor: colors.bg,
        title: brand.name,
        icon: ICON,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#00000000', symbolColor: '#b8bdd0', height: 34 },
        webPreferences,
    });

    lockDown(mainWindow);
    zoomers.zoom = attachZoom(mainWindow, 'zoom', (factor) => fitMinimumSize(mainWindow, factor));
    load(mainWindow, 'main', { bg: colors.bg, text: colors.text, muted: colors.muted, accent: colors.accent });

    // Maximising shows the window, so a hidden start keeps that for later.
    if (hidden) {
        maximizeOnShow = Boolean(prefs.maximized);
    } else if (prefs.maximized) {
        mainWindow.maximize();
    } else {
        mainWindow.show();
    }

    let boundsTimer;

    const remember = () => {
        clearTimeout(boundsTimer);
        boundsTimer = setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || !mainWindow.isVisible()) {
                return;
            }

            savePreferences({ maximized: mainWindow.isMaximized(), ...(mainWindow.isMaximized() ? {} : { windowBounds: mainWindow.getBounds() }) });
        }, 250);
    };

    mainWindow.on('resized', remember);
    mainWindow.on('moved', remember);
    mainWindow.on('maximize', remember);
    mainWindow.on('unmaximize', remember);
    mainWindow.on('blur', () => (lastBlurAt = Date.now()));

    // The X hides the window to the tray (unless switched off, or there is
    // no tray to come back from). Every other close goes through app.quit,
    // so quitting is decided in one place (before-quit).
    mainWindow.on('close', (event) => {
        if (isQuitting) {
            return;
        }

        event.preventDefault();

        if (prefs.closeToTray && tray) {
            hideToTray();
        } else {
            app.quit();
        }
    });

    // Minimised to the tray: Windows has already minimised it, so hide it
    // as well and it leaves the taskbar. showMain restores it.
    mainWindow.on('minimize', () => {
        if (prefs.minimizeToTray && tray) {
            mainWindow?.hide();
        }
    });

    // Signing out or shutting down must not be held up by the hide-to-tray close.
    for (const name of ['query-session-end', 'session-end']) {
        mainWindow.on(/** @type {any} */ (name), () => (isQuitting = true));
    }

    mainWindow.on('closed', () => {
        clearTimeout(boundsTimer);
        mainWindow = null;
        widgetWindows.forEach((window) => {
            if (!window.isDestroyed()) {
                window.close();
            }
        });
    });
}

/** Bring the main window forward from wherever it is: the tray, minimised or behind other windows. */
function showMain() {
    if (!mainWindow) {
        return;
    }

    if (maximizeOnShow) {
        maximizeOnShow = false;
        mainWindow.maximize();
    } else if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
}

/**
 * Hide the window to the tray. The first time, a Windows notification says
 * the app is still running, so closing it never looks like it quit when it
 * did not.
 */
function hideToTray() {
    mainWindow?.hide();

    if (!prefs.trayNoticeShown) {
        savePreferences({ trayNoticeShown: true });
        showNotice(`${brand.name} is still running in the tray`, 'It keeps watching your servers and alerts you when something happens. Click the tray icon to open it again, or right-click it to quit.', showMain);
    }
}

/** A Windows notification from the app itself; clicking it runs `onClick`. */
function showNotice(title, body, onClick) {
    if (!Notification.isSupported()) {
        return;
    }

    const current = new Notification({ title, body, icon: ICON });
    notice = current;
    current.on('click', onClick);
    current.on('close', () => {
        if (notice === current) {
            notice = null;
        }
    });
    current.show();
}

/**
 * Left-clicking the tray icon: hide the window when it is the one in
 * front, otherwise bring it forward. Clicking the tray takes focus away
 * from the window first, so a blur a moment ago still counts as in front.
 */
function toggleMain() {
    if (!mainWindow) {
        return;
    }

    const inFront = mainWindow.isVisible() && !mainWindow.isMinimized() && (mainWindow.isFocused() || Date.now() - lastBlurAt < 500);

    if (inFront) {
        mainWindow.hide();
    } else {
        showMain();
    }
}

/** The tray menu's status dots, drawn here rather than shipped as files. */
const dots = {};

/** A soft-edged 16 px dot (drawn at 2×, so it stays round on scaled displays). */
function dot(hex) {
    const size = 32;
    const radius = 7;
    const [red, green, blue] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    const pixels = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const alpha = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2)));
            const at = (y * size + x) * 4;

            // Premultiplied BGRA, as Chromium keeps bitmaps on Windows.
            pixels[at] = Math.round(blue * alpha);
            pixels[at + 1] = Math.round(green * alpha);
            pixels[at + 2] = Math.round(red * alpha);
            pixels[at + 3] = Math.round(255 * alpha);
        }
    }

    return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 });
}

/** The notification-area icon: click to show or hide the window, right-click for the menu. */
function createTray() {
    let image = nativeImage.createFromPath(TRAY_ICON);

    if (image.isEmpty()) {
        image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16, quality: 'best' });
    }

    Object.assign(dots, { online: dot('#3fb97a'), offline: dot('#ef5a52'), unknown: dot('#868ba3') });

    tray = new Tray(image);
    tray.setToolTip(tooltip(brand.name, traySummary));
    tray.on('click', toggleMain);
    tray.on('right-click', () => tray?.popUpContextMenu(trayMenu()));
}

/** Built on every right-click, so it always shows the latest readings. */
function trayMenu() {
    const list = traySummary?.servers ?? [];
    const widgetTarget = [traySummary?.selectedId, prefs.lastServerId, list[0]?.id].find((id) => id && list.some((server) => server.id === id));

    return Menu.buildFromTemplate([
        { label: `Open ${brand.name}`, click: showMain },
        {
            label: 'Widgets',
            enabled: Boolean(widgetTarget),
            submenu: Object.entries(WIDGET_KINDS).map(([kind, spec]) => ({ label: spec.title, click: () => widgetTarget && openWidget(kind, widgetTarget) })),
        },
        { type: 'separator' },
        { label: statusLine(traySummary), enabled: false },
        ...list.map((server) => ({ label: serverLabel(server), icon: dots[server.state], click: () => openServer(server.id) })),
        { type: 'separator' },
        { label: `Quit ${brand.name}`, click: () => app.quit() },
    ]);
}

/** Open the window on one server, from the tray menu. */
function openServer(serverId) {
    showMain();

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('tray:open-server', serverId);
    }
}

/**
 * Start with Windows, hidden in the tray (--hidden). Packaged builds only:
 * a development or screenshot run must never register itself with Windows.
 * The portable build runs from a temporary folder, so it registers the exe
 * it was started from.
 */
function applyLoginItem(enabled) {
    if (!app.isPackaged) {
        return;
    }

    app.setLoginItemSettings({ openAtLogin: enabled, path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath, args: ['--hidden'] });
}

/** Run a ban-list sync, counted so quitting can ask first while it runs. */
async function whileSyncing(run) {
    banSyncsRunning++;

    try {
        return await run();
    } finally {
        banSyncsRunning--;
    }
}

/** Quitting during a ban-list sync: ask, with the window forward to show what is going on. */
async function askToQuitDuringSync() {
    if (askingToQuit) {
        return;
    }

    askingToQuit = true;
    showMain();

    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
        type: 'warning',
        title: brand.name,
        message: 'A ban-list sync is still running',
        detail: 'Quitting now stops it part-way, so some servers may get the changes and others not. Let it finish first?',
        buttons: ['Keep running', 'Quit anyway'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
    });

    askingToQuit = false;

    if (response === 1) {
        quitDuringSync = true;
        app.quit();
    }
}

/** The open widgets, for the main window. */
const openWidgets = () => (prefs.widgets ?? []).filter((widget) => widgetWindows.has(widget.id)).map(({ id, kind, serverId }) => ({ id, kind, serverId }));

const announceWidgets = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('widgets:changed', openWidgets());
    }
};

/**
 * Open a widget on a server, or bring it forward when that one is open
 * already. `saved` reopens one from the last run, where it sat.
 *
 * @param {string} kind
 * @param {string} serverId
 * @param {import('./widgets.mjs').SavedWidget} [saved]
 */
async function openWidget(kind, serverId, saved) {
    if (!isWidgetKind(kind)) {
        return;
    }

    const existing = (prefs.widgets ?? []).find((widget) => widget.kind === kind && widget.serverId === serverId && widgetWindows.has(widget.id));

    if (existing) {
        const window = widgetWindows.get(existing.id);
        window?.show();
        window?.focus();

        return;
    }

    if (widgetWindows.size >= MAX_WIDGETS) {
        return;
    }

    const spec = WIDGET_KINDS[kind];
    const areas = screen.getAllDisplays().map((display) => display.workArea);
    // A new one opens on the screen the app is on, clear of the widgets already open.
    const area = (mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay()).workArea;
    const taken = [...widgetWindows.values()].filter((window) => !window.isDestroyed()).map((window) => window.getBounds());
    const bounds = saved?.bounds && onScreen(saved.bounds, areas) ? saved.bounds : placeWidget(kind, area, taken);
    const id = saved?.id ?? randomUUID();

    const window = new BrowserWindow({
        ...bounds,
        minWidth: spec.min.width,
        minHeight: spec.min.height,
        frame: false,
        transparent: true,
        resizable: true,
        skipTaskbar: false,
        alwaysOnTop: prefs.miniAlwaysOnTop,
        title: `${brand.name}: ${spec.title}`,
        backgroundColor: '#00000000',
        webPreferences,
    });

    const senderId = window.webContents.id;
    widgetWindows.set(id, window);
    widgetSenders.set(senderId, { id, kind, serverId });
    window.setOpacity(prefs.miniOpacity);

    if (prefs.miniAlwaysOnTop) {
        window.setAlwaysOnTop(true, 'screen-saver');
    }

    lockDown(window);
    attachZoom(window, 'miniZoom');
    load(window, `widget/${kind}/${serverId}`);

    await savePreferences((current) => ({ widgets: [...current.widgets.filter((widget) => widget.id !== id), { id, kind, serverId, bounds: window.isDestroyed() ? bounds : window.getBounds() }] }));

    let boundsTimer;

    const remember = () => {
        clearTimeout(boundsTimer);
        boundsTimer = setTimeout(() => {
            if (!window.isDestroyed()) {
                const next = window.getBounds();
                savePreferences((current) => ({ widgets: current.widgets.map((widget) => (widget.id === id ? { ...widget, bounds: next } : widget)) }));
            }
        }, 250);
    };

    window.on('resized', remember);
    window.on('moved', remember);
    window.on('closed', () => {
        clearTimeout(boundsTimer);
        widgetWindows.delete(id);
        widgetSenders.delete(senderId);

        // Quitting closes every window: the widgets stay saved, to reopen on the next start.
        if (!isQuitting && mainWindow) {
            savePreferences((current) => ({ widgets: current.widgets.filter((widget) => widget.id !== id) })).then(announceWidgets);
        }
    });

    announceWidgets();
}

/** Close the widgets on a server, when it is removed. */
function closeWidgetsFor(serverId) {
    for (const widget of prefs.widgets ?? []) {
        if (widget.serverId === serverId) {
            widgetWindows.get(widget.id)?.close();
        }
    }
}

/** Reopen the widgets that were open when the app last quit, on servers still saved. */
async function restoreWidgets() {
    const saved = new Set((await servers.list()).map((server) => server.id));
    const keep = (prefs.widgets ?? []).filter((widget) => saved.has(widget.serverId));
    await savePreferences({ widgets: keep });

    for (const widget of keep) {
        await openWidget(widget.kind, widget.serverId, widget);
    }
}

/** Start the pretend server with a fresh per-session secret and point every saved demo server at it. */
async function startDemo() {
    if (!demo) {
        demo = await startMockServer({ port: 0, password: randomBytes(24).toString('hex'), quiet: true });
    }

    for (const server of await servers.list()) {
        if (server.demo) {
            await servers.save({ ...server, port: demo.port, password: demo.password });
        }
    }

    return demo;
}

/**
 * The checks for a server the window asks to save. The window checks the
 * same, but the main process never trusts it.
 */
function cleanServer(input) {
    const name = String(input?.name ?? '').trim();
    const host = String(input?.host ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const port = Number(input?.port);
    const password = String(input?.password ?? '');

    if (name === '' || name.length > 60) {
        return { error: 'Give the server a name of up to 60 characters.' };
    }

    if (!/^[\w.-]+$|^\[?[0-9a-f:]+\]?$/i.test(host)) {
        return { error: 'The address must be an IP or host name, like 203.0.113.10.' };
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { error: 'The port must be a number from 1 to 65535.' };
    }

    return { value: { id: input?.id ? String(input.id) : undefined, name, host: host.replace(/^\[|\]$/g, ''), port, password } };
}

/** A ban list as the window sees it: its servers and counts, not every ban. */
const publicGroup = (group) => ({
    id: group.id,
    name: group.name,
    serverIds: group.serverIds,
    banCount: group.bans.length,
    liftedCount: group.tombstones.length,
    createdAt: group.createdAt,
    lastSyncedAt: group.lastSyncedAt,
});

const WIDGET_ACTIONS = new Set(['broadcast', 'restartMatch', 'endMatch']);

function registerIpc() {
    const isMain = (event) => mainWindow !== null && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
    const widgetFor = (event) => widgetSenders.get(event.sender.id) ?? null;

    /** Channels only the main window may invoke. */
    const mainHandle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
        if (!isMain(event)) {
            throw new Error('Unauthorized IPC caller.');
        }

        return fn(...args);
    });

    /** Channels both the main window and known widget windows may invoke. */
    const anyHandle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
        if (!isMain(event) && !widgetFor(event)) {
            throw new Error('Unauthorized IPC caller.');
        }

        return fn(event, ...args);
    });

    anyHandle('servers:list', async (event) => {
        await demoReady;
        const list = await servers.list();
        const widget = widgetFor(event);

        return widget ? list.filter((entry) => entry.id === widget.serverId) : list;
    });
    mainHandle('servers:save', async (input) => {
        const { value, error } = cleanServer(input);

        if (error) {
            return { ok: false, error };
        }

        if (!value.id && !value.password) {
            return { ok: false, error: 'Enter the RCON password.' };
        }

        // Check the server answers with this password before saving it.
        const target = value.password ? value : { ...value, password: (await servers.target(value.id)).password };
        const answer = await probe(target);

        if (!answer.ok) {
            return answer;
        }

        const server = await servers.save(value);
        clearCache(server.id);

        return { ok: true, server };
    });
    mainHandle('servers:remove', async (id) => {
        closeWidgetsFor(String(id));
        await servers.remove(String(id));
        await banLists.update((groups) => ({ groups: dropServer(groups, String(id)) }));
        clearCache(String(id));
    });
    mainHandle('servers:reorder', (ids) => servers.reorder(Array.isArray(ids) ? ids.map(String) : []));
    mainHandle('servers:addDemo', async () => {
        const mock = await startDemo();
        const existing = (await servers.list()).find((server) => server.demo);

        return existing ?? servers.save({ name: 'Demo server', host: '127.0.0.1', port: mock.port, password: mock.password, demo: true });
    });

    anyHandle('server:live', (event, id) => {
        const serverId = String(id);
        const widget = widgetFor(event);

        if (widget && widget.serverId !== serverId) {
            throw new Error('Unauthorized server access.');
        }

        return live(serverId);
    });
    mainHandle('server:bans', (id) => bans(String(id)));
    anyHandle('server:rotation', (event, id) => {
        const serverId = String(id);
        const widget = widgetFor(event);

        if (widget && widget.serverId !== serverId) {
            throw new Error('Unauthorized server access.');
        }

        return rotation(serverId);
    });
    mainHandle('server:catalog', (id) => catalog(String(id)));
    mainHandle('server:identity', (id) => identity(String(id)).catch(() => ({ serverId: null, bannerUrl: null })));
    mainHandle('server:settings', (id) => readSettings(String(id)));
    anyHandle('server:act', (event, id, name, args) => {
        const serverId = String(id);
        const actionName = String(name);
        const widget = widgetFor(event);

        if (widget && (widget.kind !== 'actions' || widget.serverId !== serverId || !WIDGET_ACTIONS.has(actionName))) {
            return { ok: false, error: 'This widget cannot run that action.' };
        }

        return act(serverId, actionName, args ?? {});
    });

    // Linked ban lists. Planning only reads; a sync writes only the plan the
    // user confirmed in the preview (its fingerprint must still match).
    const groupId = (value) => (typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null);

    mainHandle('banlists:list', async () => (await banLists.list()).map(publicGroup));
    mainHandle('banlists:save', async (input) => {
        const saved = await servers.list();
        const clean = {
            id: input?.id === undefined ? undefined : groupId(input.id) ?? '-',
            name: input?.name === undefined ? undefined : String(input.name),
            serverIds: input?.serverIds === undefined ? undefined : Array.isArray(input.serverIds) ? input.serverIds.slice(0, 200).map(String) : [],
        };
        const answer = await banLists.update((groups) => {
            const result = saveGroup(groups, clean, saved);

            return 'error' in result ? { result } : { groups: result.groups, result };
        });

        return 'error' in answer ? { ok: false, error: answer.error } : { ok: true, group: publicGroup(answer.group) };
    });
    mainHandle('banlists:remove', async (id) => {
        await banLists.update((groups) => ({ groups: removeGroup(groups, String(id)) }));
    });
    mainHandle('banlists:plan', (id) => (groupId(id) ? banListPlan(id) : { ok: false, error: 'That ban list no longer exists.' }));
    mainHandle('banlists:sync', (id, fingerprint) =>
        groupId(id) && typeof fingerprint === 'string' && /^[0-9a-f]{16}$/.test(fingerprint)
            ? whileSyncing(() => banListSync(id, fingerprint))
            : { ok: false, error: 'Check the differences first, then confirm the sync.' },
    );

    anyHandle('brand', () => brand);
    mainHandle('server:refresh', (id) => clearCache(String(id)));

    mainHandle('activity:list', (id) => activity.list(id ? String(id) : null));
    anyHandle('preferences:get', () => preferences.get());
    mainHandle('preferences:set', async (changes) => {
        const allowed = [
            'refreshSeconds',
            'confirmActions',
            'miniOpacity',
            'miniAlwaysOnTop',
            'lastServerId',
            'theme',
            'accent',
            'railCollapsed',
            'notifyServerDown',
            'notifyWatched',
            'watchlist',
            'broadcasts',
            'closeToTray',
            'minimizeToTray',
            'startMinimized',
            'launchAtLogin',
        ];
        const next = await savePreferences(Object.fromEntries(Object.entries(changes ?? {}).filter(([key]) => allowed.includes(key))));

        if (changes && 'launchAtLogin' in changes) {
            applyLoginItem(next.launchAtLogin);
        }

        widgetWindows.forEach((window) => {
            if (!window.isDestroyed()) {
                window.setOpacity(next.miniOpacity);
                window.setAlwaysOnTop(next.miniAlwaysOnTop, 'screen-saver');
            }
        });

        broadcast('preferences:changed', next);

        return next;
    });
    mainHandle('zoom:set', (factor) => zoomers.zoom?.(ZOOM_STEPS.includes(Number(factor)) ? Number(factor) : 1));
    mainHandle('limits', () => LIMITS);
    mainHandle('app:info', () => ({ version: app.getVersion(), dataPath: app.getPath('userData') }));

    mainHandle('widgets:open', (kind, id) => openWidget(String(kind), String(id)));
    mainHandle('widgets:list', () => openWidgets());
    // From the main window, a widget by ID; from a widget, itself.
    anyHandle('widgets:close', (event, id) => {
        const widget = widgetFor(event);
        const window = widget ? BrowserWindow.fromWebContents(event.sender) : id ? widgetWindows.get(String(id)) : null;

        if (window && window !== mainWindow && !window.isDestroyed()) {
            window.close();
        }
    });
    anyHandle('main:focus', () => showMain());
    mainHandle('external:open', (url) => openExternal(String(url)));

    // The open theme's colours, for the next start's first frame. Written
    // only when they change, and not announced: nothing else reads them.
    mainHandle('boot:colors', async (input) => {
        const colors = cleanBootColors(input);

        if (JSON.stringify(colors) !== JSON.stringify(prefs.bootColors)) {
            await savePreferences({ bootColors: colors });

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setBackgroundColor(colors.bg);
            }
        }
    });

    // The main window's summary of its servers, for the tray icon.
    ipcMain.on('tray:summary', (event, input) => {
        if (!isMain(event)) {
            return;
        }

        traySummary = cleanSummary(input);
        tray?.setToolTip(tooltip(brand.name, traySummary));
    });
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    // Starting the app again (say from the Start menu while it sits in the tray) shows the window.
    app.on('second-instance', () => showMain());

    // Quitting for real: from the tray menu, the window's X with close-to-tray
    // off, or anything else that calls app.quit. While a ban-list sync runs
    // it asks first.
    app.on('before-quit', (event) => {
        if (banSyncsRunning > 0 && !quitDuringSync) {
            event.preventDefault();
            askToQuitDuringSync();

            return;
        }

        isQuitting = true;
    });

    app.on('will-quit', () => tray?.destroy());

    app.whenReady().then(async () => {
        prefs = await preferences.get();
        registerIpc();

        // The demo server starts alongside the window rather than before it;
        // listing servers waits for it (see servers:list).
        if ((await servers.list()).some((server) => server.demo)) {
            demoReady = startDemo().then(
                () => undefined,
                (error) => console.error('[demo] could not start:', error),
            );
        }

        try {
            createTray();
        } catch (error) {
            console.error('[tray] could not be created:', error);
        }

        // Started by Windows at sign-in (--hidden), or set to start in the
        // tray. Never without a tray to open it from, nor while screenshots
        // or the click test drive the window.
        const automated = testSwitch('PANEL_SCREENSHOTS') || testSwitch('PANEL_CLICKTEST') || testSwitch('PANEL_TRAYTEST');
        const hidden = Boolean(tray) && !automated && (process.argv.includes('--hidden') || prefs.startMinimized);

        createMainWindow({ hidden });
        await demoReady;

        if (!automated) {
            restoreWidgets().catch((error) => console.error('[widgets] could not reopen:', error));
        }

        // Keep the sign-in entry pointing at this copy of the app (it may have moved or updated).
        if (prefs.launchAtLogin) {
            applyLoginItem(true);
        }

        if (testSwitch('PANEL_CLICKTEST')) {
            const { clickTest } = await import('../scripts/capture.mjs');
            await clickTest({ app, mainWindow, file: testSwitch('PANEL_CLICKTEST') });
        }

        if (testSwitch('PANEL_TRAYTEST')) {
            const { trayTest } = await import('../scripts/capture.mjs');
            await trayTest({ mainWindow, tray, trayMenu, file: testSwitch('PANEL_TRAYTEST') });
        }

        if (testSwitch('PANEL_SCREENSHOTS')) {
            const { captureViews } = await import('../scripts/capture.mjs');
            await captureViews({ app, mainWindow, openWidget, getWidget: (kind) => widgetWindows.get(openWidgets().find((widget) => widget.kind === kind)?.id ?? ''), dir: testSwitch('PANEL_SCREENSHOTS') }).catch((error) => {
                console.error('[capture] failed:', error);
                app.exit(1);
            });
        }
    });

    app.on('window-all-closed', async () => {
        await demo?.close();
        app.quit();
    });
}