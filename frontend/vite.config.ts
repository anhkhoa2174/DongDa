import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain':      resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infra':       resolve(__dirname, 'src/infrastructure'),
      '@ui':          resolve(__dirname, 'src/presentation'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
