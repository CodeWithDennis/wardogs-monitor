import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Render the app's icons from its mark (src/assets/brand/mark.svg):
 *
 * - build/icon.png (512×512): the mark on its navy, with a thin gold edge.
 * - build/tray/tray.png and its @1.25x … @3x siblings: the notification-area
 *   icon, 16 px at 100 % display scaling. Each Windows scale gets its own
 *   sharp size instead of a blurred resize (Electron picks the @ files up by
 *   name). The small sizes drop the gold edge and draw the strokes a little
 *   bolder, or the tags turn to mush at 16 px.
 *
 * Run with: npx electron scripts/make-icon.mjs (add "tray" to render only
 * the tray icons).
 */
const svg = readFileSync(new URL('../src/assets/brand/mark.svg', import.meta.url), 'utf8');
const onlyTray = process.argv.includes('tray');

const TRAY_SIZES = [
    ['tray.png', 16],
    ['tray@1.25x.png', 20],
    ['tray@1.5x.png', 24],
    ['tray@2x.png', 32],
    ['tray@2.5x.png', 40],
    ['tray@3x.png', 48],
];

/** Tray icons are drawn this many times bigger, then scaled down, for clean edges. */
const OVERSAMPLE = 8;

/** The mark on its navy tile. Sizes are fractions of the tile. */
function tile(size, { edge, radius, mark, stroke }) {
    const art = svg.replaceAll(/stroke-width="([\d.]+)"/g, (_, width) => `stroke-width="${(Number(width) * stroke).toFixed(2)}"`);

    return `<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;border-radius:${radius * size}px;box-sizing:border-box;border:${edge * size}px solid #e8b54e;
background:radial-gradient(120% 120% at 30% 0%,#2a3566,#11162a 70%);display:grid;place-items:center">
<img src="data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}" style="width:${mark * size}px"></div></body></html>`;
}

/** One hidden window draws every icon (closing the last window would quit the app). */
let win;

async function render(html, size, target) {
    win.setContentSize(size, size);
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });

    return image.resize({ width: target, height: target, quality: 'best' }).toPNG();
}

app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });

    if (!onlyTray) {
        writeFileSync(new URL('../build/icon.png', import.meta.url), await render(tile(512, { edge: 6 / 512, radius: 96 / 512, mark: 330 / 512, stroke: 1 }), 512, 512));
    }

    mkdirSync(new URL('../build/tray/', import.meta.url), { recursive: true });

    for (const [name, size] of TRAY_SIZES) {
        const small = size <= 24;
        const html = tile(size * OVERSAMPLE, { edge: 0, radius: 0.22, mark: small ? 0.92 : 0.86, stroke: small ? 1.3 : 1.12 });
        writeFileSync(new URL(`../build/tray/${name}`, import.meta.url), await render(html, size * OVERSAMPLE, size));
    }

    app.quit();
});
