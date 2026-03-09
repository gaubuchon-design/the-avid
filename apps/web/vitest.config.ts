import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/engine/**', 'src/store/**'],
    },
  },
  resolve: {
    alias: {
      '@mcua/core': path.resolve(__dirname, '../../packages/core/src'),
      '@mcua/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
