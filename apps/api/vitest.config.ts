import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
  resolve: {
    alias: {
      '@mcua/media-backend': path.join(workspaceRoot, 'packages/media-backend/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**'],
      exclude: ['src/__tests__/**'],
    },
  },
});
