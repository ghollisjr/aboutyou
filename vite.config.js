import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true
  },
  base: '/aboutyou/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        museum: resolve(__dirname, 'games/museum.html'),
      },
    },
  },
});
