import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
    // Relative asset paths, so the built page also loads from file:// in Electron.
    base: './',
    plugins: [vue()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5199, strictPort: true },
    build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
