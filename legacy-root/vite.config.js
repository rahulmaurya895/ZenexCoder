// vite.config.js – Vite with React and Electron integration
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electronRenderer from 'electron-vite';

export default defineConfig({
  plugins: [react(), electronRenderer()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
  },
});
