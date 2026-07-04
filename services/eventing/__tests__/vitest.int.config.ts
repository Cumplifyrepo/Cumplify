/**
 * Vitest config for integration tests (*.int.test.ts).
 * These call live AWS APIs and require dev credentials.
 * Run explicitly: npx vitest run --config services/eventing/__tests__/vitest.int.config.ts
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['services/eventing/__tests__/*.int.test.ts'],
    reporters: ['verbose'],
    testTimeout: 30_000,
  },
});
