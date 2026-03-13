import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const isProduction = process.env['NODE_ENV'] === 'production';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      minify: 'esbuild',
      sourcemap: isProduction ? 'hidden' : true,
      rollupOptions: {
        external: ['aja-ntv2'],
        output: {
          // Preserve dynamic imports for optional native modules
          manualChunks: undefined,
        },
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      minify: 'esbuild',
      sourcemap: isProduction ? 'hidden' : true,
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      minify: isProduction ? 'esbuild' : false,
      sourcemap: isProduction ? 'hidden' : true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html'),
        output: {
          // Stable chunk naming for better caching in production
          chunkFileNames: isProduction ? 'assets/[name]-[hash].js' : undefined,
          assetFileNames: isProduction ? 'assets/[name]-[hash][extname]' : undefined,
        },
      },
      // Increase chunk size warning for media-heavy NLE app
      chunkSizeWarningLimit: 2000,
      // Drop console.log in production (keep console.warn/error)
      ...(isProduction && {
        terserOptions: {
          compress: {
            drop_console: false,
            pure_funcs: ['console.log', 'console.debug'],
          },
        },
      }),
    },
    server: {
      fs: {
        // Strict file access — only allow reading from known project directories
        strict: true,
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
