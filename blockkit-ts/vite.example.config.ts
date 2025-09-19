import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'example',
  base: process.env.NODE_ENV === 'production' ? '/mind-fragment/blockkit/' : '/',
  resolve: {
    alias: {
      'blockkit-ts': resolve(__dirname, 'src/index.ts')
    }
  },
  build: {
    outDir: '../dist-example'
  },
  plugins: [],
  server: {
    port: 3000
  }
});