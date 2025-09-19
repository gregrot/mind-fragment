import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pixiTestAliases = {
  'pixi.js': resolve(rootDir, 'src/test/stubs/pixi.js'),
  'pixi-viewport': resolve(rootDir, 'src/test/stubs/pixi-viewport.js'),
};

export default defineConfig(() => {
  const isVitest = Boolean(process.env.VITEST);

  return {
    base: './',
    resolve: {
      alias: isVitest ? pixiTestAliases : {},
    },
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: false,
      alias: pixiTestAliases,
    },
  };
});
