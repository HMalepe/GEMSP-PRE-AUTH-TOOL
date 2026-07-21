import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Proxies /api/* to the backend so the browser never makes a cross-origin
// request — avoids needing CORS middleware on an internal-tool API
// (Technical Build Spec §1.1: "internal REST/JSON" only).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
