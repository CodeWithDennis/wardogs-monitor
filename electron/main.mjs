import { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen, shell } from 'electron';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import brand from '../brand.json' with { type: 'json' };
import { startMockServer } from '../mock/wardogs-mock.mjs';
import { LIMITS } from './config.mjs';
import { canAddServer, lockedServerIds, planLimitMessage } from './license-core.mjs';
import { licence } from './license.mjs';
import { CHECK_EVERY_MS } from './license-online.mjs';
import { dropServer, removeGroup, saveGroup } from './banlists.mjs';
import { act, banListPlan, banListSync, bans, catalog, clearCache, identity, live, probe, readSettings, rotation } from './service.mjs';
import { activity, banLists, preferences, servers, ZOOM_STEPS } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const devServer = process.env.VITE_DEV_SERVER_URL;
const BACKGROUND = '#0e1324';

// Screenshots and tests run against their own data folder, never the real one.
if (process.env.PANEL_USER_DATA) {
    app.setPath('userData', process.env.PANEL_USER_DATA);
} else {
    // A data folder that stays put whatever the product is called; saved
    // servers, preferences and the log come along from an older name once.
    const dataFolder = path.join(app.getPath('appData'), brand.dataFolder);

    if (!existsSync(path.join(dataFolder, 'servers.json'))) {
        for (const previous of brand.previousDataFolders) {
            const from = path.join(app.getPath('appData'), previous);

            if (existsSync(path.join(from, 'servers.json'))) {
                for (const file of ['servers.json', 'preferences.json', 'activity.log', 'license.json']) {
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

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let miniWindow = null;
/** @type {{ port: number, close: () => Promise<void> } | null} */
let demo = null;

function load(window, view) {
    if (devServer) {
        window.loadURL(`${devServer}#${view}`);
    } else {
        window.loadFile(path.join(here, '..', 'dist', 'index.html'), { hash: view });
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

/** Only Steam profiles and the product's website open outside the app. */
function openExternal(url) {
    try {
        const { protocol, hostname } = new URL(url);

        const website = brand.website ? new URL(brand.website).hostname : null;

        if (protocol === 'https:' && (hostname === 'steamcommunity.com' || hostname === website)) {
            shell.openExternal(url);
        }
    } catch {
        // Not a link.
    }
}

/**
 * Zoom like a browser: Ctrl + / Ctrl = and Ctrl - (also on the number pad),
 * Ctrl 0 to reset, and Ctrl + mouse wheel. Each window remembers its zoom.
 */
function attachZoom(window, key) {
    const apply = async (factor) => {
        window.webContents.setZoomFactor(factor);
        const next = await preferences.set({ [key]: factor });
        BrowserWindow.getAllWindows().forEach((other) => other.webContents.send('preferences:changed', next));
    };

    const step = (direction) => {
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
        window.webContents.setZoomFactor((await preferences.get())[key] ?? 1);
    });

    return apply;
}

/** @type {Record<string, (factor: number) => void>} */
const zoomers = {};

const webPreferences = {
    preload: path.join(here, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
};

async function createMainWindow() {
    const prefs = await preferences.get();
    const area = screen.getPrimaryDisplay().workArea;
    const bounds = prefs.windowBounds && screen.getDisplayMatching(prefs.windowBounds) ? prefs.windowBounds : { width: Math.min(1500, area.width - 40), height: Math.min(920, area.height - 40) };

    mainWindow = new BrowserWindow({
        ...bounds,
        minWidth: 1180,
        minHeight: 720,
        show: false,
        backgroundColor: BACKGROUND,
        title: brand.name,
        icon: path.join(here, '..', 'build', 'icon.png'),
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#00000000', symbolColor: '#b8bdd0', height: 34 },
        webPreferences,
    });

    if (prefs.maximized) {
        mainWindow.maximize();
    }

    lockDown(mainWindow);
    zoomers.zoom = attachZoom(mainWindow, 'zoom');
    load(mainWindow, 'main');
    mainWindow.once('ready-to-show', () => mainWindow?.show());

    const remember = () => {
        if (!mainWindow || mainWindow.isMinimized()) {
            return;
        }

        preferences.set({ maximized: mainWindow.isMaximized(), ...(mainWindow.isMaximized() ? {} : { windowBounds: mainWindow.getBounds() }) });
    };

    mainWindow.on('resized', remember);
    mainWindow.on('moved', remember);
    mainWindow.on('maximize', remember);
    mainWindow.on('unmaximize', remember);

    mainWindow.on('closed', () => {
        mainWindow = null;
        miniWindow?.close();
    });
}

async function openMini(serverId) {
    const prefs = await preferences.get();

    if (miniWindow) {
        miniWindow.webContents.send('mini:server', serverId);
        miniWindow.show();
        miniWindow.focus();

        return;
    }

    const area = screen.getPrimaryDisplay().workArea;
    const bounds = prefs.miniBounds ?? { width: 420, height: 330, x: area.x + area.width - 440, y: area.y + 80 };

    miniWindow = new BrowserWindow({
        ...bounds,
        minWidth: 350,
        minHeight: 220,
        frame: false,
        transparent: true,
        resizable: true,
        skipTaskbar: false,
        alwaysOnTop: prefs.miniAlwaysOnTop,
        title: `${brand.name}: mini monitor`,
        backgroundColor: '#00000000',
        webPreferences,
    });

    miniWindow.setOpacity(prefs.miniOpacity);

    if (prefs.miniAlwaysOnTop) {
        miniWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    lockDown(miniWindow);
    zoomers.miniZoom = attachZoom(miniWindow, 'miniZoom');
    load(miniWindow, `mini/${serverId}`);

    const remember = () => miniWindow && preferences.set({ miniBounds: miniWindow.getBounds() });
    miniWindow.on('resized', remember);
    miniWindow.on('moved', remember);
    miniWindow.on('closed', () => {
        miniWindow = null;
        mainWindow?.webContents.send('mini:closed');
    });
}

/** Start the pretend server and point every saved demo server at it. */
async function startDemo() {
    if (!demo) {
        demo = await startMockServer({ port: 0, password: 'demo-password', quiet: true });
    }

    for (const server of await servers.list()) {
        if (server.demo && server.port !== demo.port) {
            await servers.save({ ...server, port: demo.port });
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

/** Why every real server is locked, per reason the licence gives. */
const LOCKED = {
    trial: 'Your free trial has ended. Activate a licence under Options → Licence to keep using your servers. The demo server still works.',
    licence: 'Your licence has ended. Renew it under Options → Licence → Manage subscription; the app picks up the renewal by itself. The demo server still works.',
    revoked: 'Your licence was revoked. Activate another licence under Options → Licence to keep using your servers. The demo server still works.',
    offline: 'Your licence could not be confirmed online for too long. Connect this PC to the internet so the app can check it. The demo server still works.',
};

/**
 * Whether a server is locked, and why. Real servers need the trial or a
 * licence, and only the plan's number of them work: the first ones in the
 * saved order, the rest are locked (never deleted). The demo server always
 * works.
 *
 * @returns {Promise<{ by: 'licence' | 'plan', message: string } | null>}
 */
async function lockOf(serverId) {
    const saved = await servers.list();
    const server = saved.find((entry) => entry.id === serverId);

    if (!server || server.demo) {
        return null;
    }

    const status = await licence.status();

    if (status.state === 'expired') {
        return { by: 'licence', message: LOCKED[status.reason] ?? LOCKED.trial };
    }

    return lockedServerIds(saved, status.maxServers).has(serverId) ? { by: 'plan', message: planLimitMessage(status) } : null;
}

/** Tell every window the licence changed (servers may have locked or unlocked). */
function announceLicence(status) {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('license:changed', status));
}

/** Check the licence with the website; tell the windows when anything changed. */
async function checkLicence() {
    try {
        const before = JSON.stringify(await licence.status());
        const after = await licence.check();

        if (JSON.stringify(after) !== before) {
            announceLicence(after);
        }

        return after;
    } catch {
        return licence.status();
    }
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

function registerIpc() {
    const handle = (channel, fn) => ipcMain.handle(channel, (_event, ...args) => fn(...args));

    /** A server read or action that the licence gates, with what to answer when locked. */
    const gated = (channel, fn, lockedAnswer) =>
        handle(channel, async (id, ...rest) => {
            const lock = await lockOf(String(id));

            return lock ? lockedAnswer(lock.message, lock.by) : fn(String(id), ...rest);
        });

    handle('servers:list', () => servers.list());
    handle('servers:save', async (input) => {
        const { value, error } = cleanServer(input);

        if (error) {
            return { ok: false, error };
        }

        if (!value.id && !value.password) {
            return { ok: false, error: 'Enter the RCON password.' };
        }

        // A new server must fit the plan (editing one is fine). Once the trial
        // or licence has ended every real server is locked anyway.
        const saved = await servers.list();

        if (!saved.some((server) => server.id === value.id)) {
            const status = await licence.status();

            if (status.state !== 'expired' && !canAddServer(saved, status.maxServers)) {
                return { ok: false, error: planLimitMessage(status, 'add'), limit: true };
            }
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
    handle('servers:remove', async (id) => {
        await servers.remove(String(id));
        await banLists.update((groups) => ({ groups: dropServer(groups, String(id)) }));
        clearCache(String(id));
    });
    handle('servers:reorder', (ids) => servers.reorder(Array.isArray(ids) ? ids.map(String) : []));
    handle('servers:addDemo', async () => {
        const mock = await startDemo();
        const existing = (await servers.list()).find((server) => server.demo);

        return existing ?? servers.save({ name: 'Demo server', host: '127.0.0.1', port: mock.port, password: mock.password, demo: true });
    });

    gated('server:live', (id) => live(id), (error, by) => ({ online: false, locked: true, lockedBy: by, error, checkedAt: new Date().toISOString(), status: null, players: [], uptimeSeconds: null }));
    gated('server:bans', (id) => bans(id), (error) => ({ error, bans: [] }));
    gated('server:rotation', (id) => rotation(id), (error) => ({ error, enabled: false, mode: null, entries: [] }));
    gated('server:catalog', (id) => catalog(id), (error) => ({ error, maps: [], lightings: [] }));
    gated('server:identity', (id) => identity(id).catch(() => ({ serverId: null, bannerUrl: null })), () => ({ serverId: null, bannerUrl: null }));
    gated('server:settings', (id) => readSettings(id), (error) => ({ error, revision: null, writable: false, settings: null, rotation: null }));
    gated('server:act', (id, name, args) => act(id, String(name), args ?? {}), (error) => ({ ok: false, error }));

    // Linked ban lists. Planning only reads; a sync writes only the plan the
    // user confirmed in the preview (its fingerprint must still match).
    const groupId = (value) => (typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null);

    handle('banlists:list', async () => (await banLists.list()).map(publicGroup));
    handle('banlists:save', async (input) => {
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
    handle('banlists:remove', async (id) => {
        await banLists.update((groups) => ({ groups: removeGroup(groups, String(id)) }));
    });
    handle('banlists:plan', (id) => (groupId(id) ? banListPlan(id, lockOf) : { ok: false, error: 'That ban list no longer exists.' }));
    handle('banlists:sync', (id, fingerprint) =>
        groupId(id) && typeof fingerprint === 'string' && /^[0-9a-f]{16}$/.test(fingerprint)
            ? banListSync(id, fingerprint, lockOf)
            : { ok: false, error: 'Check the differences first, then confirm the sync.' },
    );

    handle('license:status', () => licence.status());
    handle('license:activate', async (key) => {
        const result = await licence.activate(String(key ?? ''));

        if (result.ok) {
            announceLicence(result.status);
        }

        return result;
    });
    handle('license:check', () => checkLicence());
    handle('license:remove', async () => {
        const status = await licence.remove();
        announceLicence(status);

        return status;
    });
    handle('brand', () => brand);
    handle('server:refresh', (id) => clearCache(String(id)));

    handle('activity:list', (id) => activity.list(id ? String(id) : null));
    handle('preferences:get', () => preferences.get());
    handle('preferences:set', async (changes) => {
        const allowed = ['refreshSeconds', 'confirmActions', 'miniOpacity', 'miniAlwaysOnTop', 'lastServerId', 'theme', 'accent', 'railCollapsed', 'sidebarCollapsed', 'detailCollapsed', 'titleFont', 'notifyServerDown', 'notifyWatched', 'watchlist', 'broadcasts'];
        const next = await preferences.set(Object.fromEntries(Object.entries(changes ?? {}).filter(([key]) => allowed.includes(key))));

        if (miniWindow) {
            miniWindow.setOpacity(next.miniOpacity);
            miniWindow.setAlwaysOnTop(next.miniAlwaysOnTop, 'screen-saver');
        }

        BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('preferences:changed', next));

        return next;
    });
    handle('zoom:set', (factor) => zoomers.zoom?.(ZOOM_STEPS.includes(Number(factor)) ? Number(factor) : 1));
    handle('limits', () => LIMITS);
    handle('app:info', () => ({ version: app.getVersion(), dataPath: app.getPath('userData') }));

    handle('mini:open', (id) => openMini(String(id)));
    handle('mini:close', () => miniWindow?.close());
    handle('main:focus', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }

            mainWindow.focus();
        }
    });
    handle('external:open', (url) => openExternal(String(url)));
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }

            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        registerIpc();

        if ((await servers.list()).some((server) => server.demo)) {
            await startDemo();
        }

        await createMainWindow();

        // Check the licence with the website now and every 12 hours.
        checkLicence();
        setInterval(checkLicence, CHECK_EVERY_MS);

        if (process.env.PANEL_CLICKTEST) {
            const { clickTest } = await import('../scripts/capture.mjs');
            await clickTest({ app, mainWindow, file: process.env.PANEL_CLICKTEST });
        }

        if (process.env.PANEL_SCREENSHOTS) {
            const { captureViews } = await import('../scripts/capture.mjs');
            await captureViews({ app, mainWindow, openMini, getMini: () => miniWindow, dir: process.env.PANEL_SCREENSHOTS }).catch((error) => {
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