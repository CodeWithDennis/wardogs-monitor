import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

/**
 * Development: start Vite with hot reload, then Electron pointed at it.
 * Closing the app stops Vite too.
 */
const require = createRequire(import.meta.url);
const electron = require('electron');

const vite = await createServer({ configFile: 'vite.config.ts' });
await vite.listen();
const url = vite.resolvedUrls.local[0];

const child = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async (code) => {
    await vite.close();
    process.exit(code ?? 0);
});
