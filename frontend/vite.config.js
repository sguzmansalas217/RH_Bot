import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      // Dos páginas: la de presentación (/) y el panel de administración (/panel/)
      input: {
        landing: resolve(__dirname, 'index.html'),
        panel: resolve(__dirname, 'panel/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3005',
      '/uploads': 'http://localhost:3005',
    },
  },
});
