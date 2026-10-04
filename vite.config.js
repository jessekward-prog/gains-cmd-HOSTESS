import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/timer-sound.mp3': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/sw.js': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/manifest.json': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/icons': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
