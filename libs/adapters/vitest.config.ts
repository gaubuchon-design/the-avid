import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**'],
      exclude: ['src/**/__tests__/**'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 45,
        lines: 50,
      },
    },
  },
});
