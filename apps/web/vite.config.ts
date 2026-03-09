import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mcua/core': path.resolve(__dirname, '../../packages/core/src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_API_URL || 'http://localhost:4000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          state: ['zustand', 'immer'],
        },
      },
    },
  },
});
