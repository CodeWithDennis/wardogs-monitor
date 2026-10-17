import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Screenshot mode (npm run screenshots): add the demo server, open every
 * view in turn and save each as a PNG, then quit. Runs inside Electron's
 * main process with its own data folder.
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureViews({ app, mainWindow, openWidget, getWidget, dir }) {
    await mkdir(dir, { recursive: true });
    const web = mainWindow.webContents;
    web.on('console-message', (_event, level, message) => level >= 2 && console.log('[page]', message));
    const run = (code) => web.executeJavaScript(code);
    const shot = async (name, window = mainWindow) => {
        // Capturing can fail now and then while the GPU is busy, so try a few times.
        const capture = (tries) =>
            window.webContents.capturePage().catch(async (error) => {
                if (tries <= 1) {
                    throw error;
                }

                await wait(1000);

                return capture(tries - 1);
            });
        const image = await capture(4);
        await writeFile(path.join(dir, `${name}.png`), image.toPNG());
        console.log(`[capture] ${name}`);
    };

    await new Promise((resolve) => (web.isLoading() ? web.once('did-finish-load', resolve) : resolve()));
    mainWindow.setSize(1500, 920);
    await wait(1200);
    await shot('00-welcome');

    await run(`document.querySelector('.welcome .btn:not(.btn-primary)').click()`);
    await wait(2500);

    // Two more servers for the cards: another on the demo match, and one that is down.
    const { servers } = await import('../electron/store.mjs');
    const demo = (await servers.list()).find((server) => server.demo);
    const { password } = await servers.target(demo.id);
    await servers.save({ name: 'Alpha Company | Events', host: '127.0.0.1', port: demo.port, password });
    await servers.save({ name: 'Alpha Company | Training', host: '127.0.0.1', port: 1, password: 'x' });
    const loaded = new Promise((resolve) => web.once('did-finish-load', resolve));
    web.reload();
    // The boot screen, while it waits for the server that is down to answer.
    await new Promise((resolve) => web.once('dom-ready', resolve));
    await wait(150);
    console.log('[capture] boot screen:', await run(`(document.querySelector('.boot-screen .boot-status')?.textContent ?? 'gone') + ' / hidden: ' + document.hidden`));
    await shot('00b-boot');
    await loaded;
    await wait(4500);

    const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)})?.click()`);

    await click('[data-section="servers"]');
    await wait(1500);
    await shot('01-servers');

    await click('.server-card .menu-wrap .icon-btn');
    await wait(500);
    await shot('02-card-menu');
    await click('.server-card .menu .bad');
    await wait(500);
    await shot('03-remove-confirm');
    await click('.modal .btn-ghost');
    await wait(300);

    await click('.switcher .current');
    await wait(500);
    await shot('04-switcher');
    await click('.switcher .current');

    await click('.server-card');
    await wait(1500);

    const views = ['overview', 'players', 'match', 'rotation', 'bans', 'settings'];

    for (const [index, view] of views.entries()) {
        await click(`[data-view="${view}"]`);
        await wait(1300);
        await shot(`${String(index + 5).padStart(2, '0')}-${view}`);
    }

    await run(`window.panel.preferences.set({ railCollapsed: true })`);
    web.reload();
    await new Promise((resolve) => web.once('did-finish-load', resolve));
    await wait(3000);
    await shot('10b-collapsed');
    await run(`window.panel.preferences.set({ railCollapsed: false })`);
    web.reload();
    await new Promise((resolve) => web.once('did-finish-load', resolve));
    await wait(3000);
    await click('.server-card');
    await wait(1000);

    await click('[data-view="players"]');
    await wait(600);
    await run(`document.querySelectorAll('.player')[2]?.click()`);
    await wait(800);
    await shot('11-player');

    await click('[data-section="activity"]');
    await wait(800);
    await shot('12-activity');

    await click('[data-section="options"]');
    await wait(800);
    console.log('[capture] view after options click:', await run(`document.querySelector('.view-header h2')?.textContent`));
    await shot('13-options');
    await run(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Servers'))?.click()`);
    await wait(800);
    await shot('13b-options-servers');
    await run(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('General'))?.click()`);

    // Zoom: Ctrl+= in, Ctrl+0 back, through the app's own key handler.
    const key = (keyCode) => {
        web.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] });
        web.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] });
    };
    key('=');
    await wait(400);
    key('=');
    await wait(600);
    console.log('[capture] zoom after Ctrl+= twice:', web.getZoomFactor());
    await shot('15-zoomed');
    key('0');
    await wait(400);
    console.log('[capture] zoom after Ctrl+0:', web.getZoomFactor());

    await run(`document.querySelector('[data-section="options"]').click()`);
    await wait(300);
    await run(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('Appearance'))?.click()`);
    await wait(800);
    await shot('16-appearance');

    await run(`document.querySelector('[data-section="control"]').click()`);
    await wait(300);
    await click('[data-view="players"]');
    await wait(800);
    const box = await run(`(() => { const r = document.querySelectorAll('.player')[3].getBoundingClientRect(); return { x: Math.round(r.x + 120), y: Math.round(r.y + 20) }; })()`);
    web.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'right', clickCount: 1 });
    web.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'right', clickCount: 1 });
    await wait(600);
    await shot('17-context-menu');
    await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);

    await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`);
    await wait(500);
    await run(`(() => { const i = document.querySelector('.palette input'); i.value = 'ro'; i.dispatchEvent(new Event('input')); })()`);
    await wait(500);
    await shot('18-palette');
    await run(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`);
    await wait(300);

    await run(`window.panel.preferences.set({ theme: 'midnight', accent: 'gold' })`);
    await click('[data-view="overview"]');
    await wait(1200);
    await shot('19-midnight-gold');
    await run(`window.panel.preferences.set({ theme: 'olive-drab', accent: 'signal-red' })`);
    await wait(800);
    await shot('20-olive-drab');
    await run(`window.panel.preferences.set({ theme: 'midnight', accent: 'gold' })`);

    await captureDialogs({ mainWindow, run, click, shot });

    // Licence: the trial, then an ended trial (servers locked), then a key activated.
    const tab = (label) => run(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('${label}'))?.click()`);
    await click('[data-section="options"]');
    await wait(300);
    await tab('Licence');
    await wait(700);
    await shot('21-licence-trial');

    const { writeFileSync: writeSync, readFileSync: readSync } = await import('node:fs');
    writeSync(path.join(app.getPath('userData'), 'trial.json'), JSON.stringify({ startedAt: '2020-01-01T00:00:00.000Z' }));
    const reloaded = new Promise((resolve) => web.once('did-finish-load', resolve));
    web.reload();
    await reloaded;
    await wait(4000);
    await click('[data-section="servers"]');
    await wait(2500);
    console.log('[capture] after trial ended:', await run(`document.querySelector('.view-header h2')?.textContent + ' / ' + (document.querySelector('.banner')?.textContent ?? 'no banner').trim()`));
    await shot('22-trial-ended');

    // The banner at the smallest window, and zoomed out, must stay clear of the window's own buttons.
    mainWindow.setSize(1180, 720);
    await wait(800);
    await shot('22b-trial-ended-min');
    const captionArea = () => run(`(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;width:var(--caption-w);height:var(--caption-h)'; document.body.append(d); const r = [d.offsetWidth, d.offsetHeight]; d.remove(); return r; })()`);
    console.log('[capture] caption area (CSS px) at 100%:', await captionArea());
    await run(`window.panel.setZoom(0.67)`);
    await wait(800);
    console.log('[capture] caption area (CSS px) at 67%:', await captionArea());
    await shot('22c-trial-ended-zoomed-out');
    await run(`window.panel.setZoom(1)`);
    mainWindow.setSize(1500, 920);
    await wait(800);

    const { issueKey } = await import('../electron/license-core.mjs');
    const brandJson = JSON.parse(readSync(new URL('../brand.json', import.meta.url), 'utf8'));
    const licenceKey = issueKey({ name: 'Jane Doe', email: 'jane@example.com', plan: 'pro', days: 365 }, readSync(new URL('../license-signing/private.pem', import.meta.url), 'utf8'), brandJson.licenseKeyPrefix);
    await click('.banner .btn');
    await wait(600);
    await run(`(() => { const t = document.querySelector('.activate textarea'); t.value = ${JSON.stringify(licenceKey)}; t.dispatchEvent(new Event('input')); })()`);
    await wait(300);
    await click('.activate .btn-primary');
    await wait(1500);
    console.log('[capture] licence after activating:', await run(`window.panel.license.status().then((s) => s.state)`));
    await shot('23-licensed');

    // Window sizes: from the smallest the window allows up.
    await run(`document.querySelector('[data-section="control"]')?.click()`);
    await wait(500);

    for (const [width, height] of [[1360, 640], [1440, 900], [2560, 1400]]) {
        mainWindow.unmaximize();
        mainWindow.setSize(width, height);
        await wait(1500);

        for (const view of ['overview', 'players']) {
            await run(`document.querySelector('[data-view="${view}"]')?.click()`);
            await wait(1400);
            await shot(`50-${width}x${height}-${view}`);
        }
    }

    mainWindow.setSize(1500, 920);
    await wait(600);

    // The widget picker, then one of each widget on the first server.
    const serverId = await run(`window.panel.servers.list().then((list) => list[0].id)`);
    await click('[data-view="overview"]');
    await wait(600);
    await click('.hero-buttons .icon-btn');
    await wait(700);
    await shot('14-widget-picker');
    await run(`document.querySelector('.modal .close')?.click()`);

    for (const kind of ['status', 'score', 'players', 'actions']) {
        await openWidget(kind, serverId);
    }

    await wait(3500);

    for (const kind of ['status', 'score', 'players', 'actions']) {
        await shot(`14-widget-${kind}`, getWidget(kind));
    }

    app.quit();
}

/**
 * Every dialog at the smallest window size (so no button spills out of
 * one), then a few pages and a dialog in two other headline fonts. Only
 * opens dialogs and cancels them; the one ban list it makes lives in the
 * throwaway data folder.
 */
async function captureDialogs({ mainWindow, run, click, shot }) {
    const web = mainWindow.webContents;
    const reload = async () => {
        const loaded = new Promise((resolve) => web.once('did-finish-load', resolve));
        web.reload();
        await loaded;
        await wait(3500);
    };
    const press = (selector, text) => run(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`);
    const cancel = async () => {
        await click('.modal footer .btn-ghost:not(.demo)');
        await wait(400);
    };

    mainWindow.setSize(1180, 720);
    await wait(800);

    await click('[data-section="servers"]');
    await wait(1200);
    await shot('30-min-servers');
    await click('.view-header .actions .btn-primary');
    await wait(500);
    await shot('31-add-server');
    await cancel();

    await click('.server-card .menu-wrap .icon-btn');
    await wait(400);
    await click('.server-card .menu .bad');
    await wait(500);
    await shot('32-remove-confirm-min');
    await cancel();

    // A linked ban list over all three servers, for the sync preview and the two-way unban question.
    const ids = await run(`window.panel.servers.list().then((list) => list.map((server) => server.id))`);
    console.log('[capture] ban list:', JSON.stringify(await run(`window.panel.banLists.save(${JSON.stringify({ name: 'Alpha bans', serverIds: ids })})`)).slice(0, 160));
    await reload();

    await click('[data-section="options"]');
    await wait(400);
    await press('.tabs button', 'Ban lists');
    await wait(800);
    await shot('33-ban-lists');
    await press('.banlists .btn-primary', 'Sync now');
    await wait(3000);
    await shot('34-ban-sync');
    await cancel();

    await click('[data-section="servers"]');
    await wait(800);
    await click('.server-card');
    await wait(1200);
    await click('[data-view="bans"]');
    await wait(1500);
    await press('.view-body .btn, .toolbar .btn, .view-header .btn', 'Ban a Steam ID');
    await wait(500);
    await shot('35-add-ban');
    await cancel();
    await click('.ban');
    await wait(600);
    await click('.detail .cta');
    await wait(600);
    await shot('36-unban-choice');
    await cancel();

    await click('[data-view="players"]');
    await wait(1000);
    await run(`document.querySelectorAll('.player')[1]?.click()`);
    await wait(800);
    await press('.detail .btn', 'Kick');
    await wait(500);
    await shot('37-kick');
    await cancel();

    await click('[data-view="rotation"]');
    await wait(1500);
    await press('.btn', 'Add match');
    await wait(800);
    await shot('38-match-picker');
    await cancel();

    mainWindow.setSize(1500, 920);
    await wait(800);
}

/**
 * Tray test (PANEL_TRAYTEST=<file>): check the tray icon is in the
 * notification area, close the window with its X and check it only hid
 * (the app still running), bring it back the way the tray menu does, then
 * quit through the tray menu's own Quit item. Writes what it saw to the
 * file as JSON; the app must exit by itself afterwards.
 */
export async function trayTest({ mainWindow, tray, trayMenu, file }) {
    const web = mainWindow.webContents;
    await new Promise((resolve) => (web.isLoading() ? web.once('did-finish-load', resolve) : resolve()));
    await wait(2500);

    const report = { tray: Boolean(tray), trayBounds: tray?.getBounds() ?? null, visibleAtStart: mainWindow.isVisible() };
    report.bootGone = await web.executeJavaScript(`!document.querySelector('.boot-screen')`);

    // The demo server, so the menu has a server and a status line to show.
    await web.executeJavaScript(`window.panel.servers.addDemo()`);
    const reloaded = new Promise((resolve) => web.once('did-finish-load', resolve));
    web.reload();
    await reloaded;
    await wait(3000);
    report.menu = trayMenu().items.map((item) => (item.type === 'separator' ? '---' : `${item.label}${item.enabled ? '' : ' (disabled)'}`));

    mainWindow.close();
    await wait(800);
    report.afterClose = { windowExists: !mainWindow.isDestroyed(), visible: !mainWindow.isDestroyed() && mainWindow.isVisible() };

    trayMenu().items.find((item) => item.label.startsWith('Open '))?.click();
    await wait(800);
    report.afterOpen = { visible: mainWindow.isVisible() };

    await writeFile(file, JSON.stringify(report, null, 2));
    trayMenu().items.find((item) => item.label.startsWith('Quit '))?.click();
}

/**
 * Click test (PANEL_CLICKTEST=<file>): open the add-server dialog on the
 * welcome screen and write the screen position of its Name field to the
 * file, for a real OS mouse click from outside. Then report whether the
 * field got focus, which a window-drag region underneath would prevent.
 */
export async function clickTest({ app, mainWindow, file }) {
    const web = mainWindow.webContents;
    await new Promise((resolve) => (web.isLoading() ? web.once('did-finish-load', resolve) : resolve()));
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    await wait(1200);
    await web.executeJavaScript(`document.querySelector('.welcome .btn-primary').click()`);
    await wait(600);
    await web.executeJavaScript(`document.activeElement.blur()`);

    const rect = await web.executeJavaScript(`(() => { const r = document.querySelector('.modal input').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const content = mainWindow.getContentBounds();
    const { screen } = await import('electron');
    const point = screen.dipToScreenPoint({ x: content.x + rect.x, y: content.y + rect.y });
    await writeFile(file, JSON.stringify(point));

    let focused = false;

    for (let i = 0; i < 60 && !focused; i++) {
        await wait(250);
        focused = await web.executeJavaScript(`document.activeElement === document.querySelector('.modal input')`);
    }

    await writeFile(file, JSON.stringify({ ...point, focused }));
    app.quit();
}
