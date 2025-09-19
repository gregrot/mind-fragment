import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const pixiTestAliases: Record<string, string> = {
  'pixi.js': resolve(rootDir, 'src/test/stubs/pixi.ts'),
  'pixi-viewport': resolve(rootDir, 'src/test/stubs/pixi-viewport.ts'),
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
      setupFiles: './src/test/setup.ts',
      css: false,
      alias: pixiTestAliases,
      exclude: [...configDefaults.exclude, 'playwright/**'],
    },
  };
});
