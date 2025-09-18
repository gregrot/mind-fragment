import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/utils/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'dist-example/',
        'tests/',
        '**/*.config.ts',
        '**/*.config.js',
        'example/'
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    }
  },
  resolve: {
    alias: {
      'blockkit-ts': resolve(__dirname, 'src/index.ts')
    }
  }
});