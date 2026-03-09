import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Preserve dynamic imports for optional native modules
          manualChunks: undefined,
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      minify: 'esbuild',
      sourcemap: true,
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
      },
      // Increase chunk size warning for media-heavy NLE app
      chunkSizeWarningLimit: 2000,
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
