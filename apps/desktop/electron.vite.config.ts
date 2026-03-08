import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    server: {
      fs: {
        allow: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, '../web/src'),
          path.resolve(__dirname, '../../packages'),
        ],
      },
    },
    resolve: {
      alias: {
        '@mcua/core': path.resolve(__dirname, '../../packages/core/src'),
      },
    },
  },
});
