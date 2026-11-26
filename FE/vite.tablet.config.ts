import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: fileURLToPath(new URL('./tablet', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    allowedHosts: ['sachul.local'],
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
  },
  preview: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    allowedHosts: ['sachul.local'],
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: { outDir: fileURLToPath(new URL('./dist-tablet', import.meta.url)), emptyOutDir: true },
});
