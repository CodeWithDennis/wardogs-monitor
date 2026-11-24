import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/** Allow Vite's HMR WebSocket in dev without relaxing the packaged app's CSP. */
const devCsp = {
    name: 'dev-csp',
    apply: 'serve' as const,
    transformIndexHtml: (html: string) => html.replace("connect-src 'self'", "connect-src 'self' ws://localhost:5199"),
};

export default defineConfig({
    // Relative asset paths, so the built page also loads from file:// in Electron.
    base: './',
    plugins: [vue(), devCsp],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5199, strictPort: true },
    build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
});
