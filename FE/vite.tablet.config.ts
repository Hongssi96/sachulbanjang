import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { proxy } from './vite.proxy';
export default defineConfig({
  root: fileURLToPath(new URL('./tablet', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: ['sachul.local'],
    proxy,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
  },
  preview: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: ['sachul.local'],
    proxy,
  },
  build: { outDir: fileURLToPath(new URL('./dist-tablet', import.meta.url)), emptyOutDir: true },
});
