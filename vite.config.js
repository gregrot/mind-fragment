import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'pixi.js': resolve(rootDir, 'src/test/stubs/pixi.js'),
      'pixi-viewport': resolve(rootDir, 'src/test/stubs/pixi-viewport.js'),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false
  }
});
