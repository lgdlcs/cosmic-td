import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/cosmic-td/' : '/',
  resolve: {
    alias: {
      '@ect/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
  },
});
