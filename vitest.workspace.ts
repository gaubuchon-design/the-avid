import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/*/vitest.config.{ts,js}',
  'packages/*/vitest.config.{ts,js}',
  'libs/*/vitest.config.{ts,js}',
  'services/*/vitest.config.{ts,js}',
]);
