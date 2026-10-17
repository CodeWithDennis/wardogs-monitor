import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/** Launch the built app in screenshot mode with a throwaway data folder. */
const require = createRequire(import.meta.url);
const electron = require('electron');
const out = path.resolve(process.argv[2] ?? 'screenshots');
const data = mkdtempSync(path.join(os.tmpdir(), 'panel-shots-'));

const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, PANEL_SCREENSHOTS: out, PANEL_USER_DATA: data } });

child.on('close', (code) => {
    rmSync(data, { recursive: true, force: true });
    console.log(`Screenshots in ${out}`);
    process.exit(code ?? 0);
});
