import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const isProduction = process.env['NODE_ENV'] === 'production';
const workspaceAliases = {
  '@mcua/core': path.resolve(__dirname, '../../packages/core/src'),
  '@mcua/media-backend': path.resolve(__dirname, '../../packages/media-backend/src'),
  '@mcua/ui': path.resolve(__dirname, '../../packages/ui/src'),
};
const bundledWorkspacePackages = Object.keys(workspaceAliases);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
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
    resolve: {
      alias: workspaceAliases,
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundledWorkspacePackages })],
    build: {
      outDir: 'dist/preload',
      minify: 'esbuild',
      sourcemap: isProduction ? 'hidden' : true,
    },
    resolve: {
      alias: workspaceAliases,
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
      alias: workspaceAliases,
    },
  },
});
