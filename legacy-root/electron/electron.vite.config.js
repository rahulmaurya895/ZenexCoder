// electron/electron.vite.config.js
// Electron‑Vite configuration – points to custom main & preload files & sets renderer root
import { defineConfig } from 'electron-vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'main.js') },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'preload.js') },
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, '../index.html') },
      },
    },
  },
});
