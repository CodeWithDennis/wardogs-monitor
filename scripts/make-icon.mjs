import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Render build/icon.png (512×512) from the app's mark on its
 * navy, with a thin gold edge. Run with: npx electron scripts/make-icon.mjs
 */
const svg = readFileSync(new URL('../src/assets/brand/mark.svg', import.meta.url), 'utf8');
const html = `<html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;border-radius:96px;box-sizing:border-box;border:6px solid #e8b54e;
background:radial-gradient(120% 120% at 30% 0%,#2a3566,#11162a 70%);display:grid;place-items:center">
<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:330px"></div></body></html>`;

app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    writeFileSync(new URL('../build/icon.png', import.meta.url), image.resize({ width: 512, height: 512 }).toPNG());
    app.quit();
});
