import { defineConfig } from 'vitest/config';

/**
 * Readback test configuration — serial execution, no watch mode.
 * These tests read the live dev account via aws-api MCP (cumplify-dev-readonly).
 * AOSS-adjacent assertions carry the 45-second timeout budget per 02-aoss-rule.md.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['infra/readback/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out'],
    reporters: ['verbose'],
    testTimeout: 60_000, // 60s default; AOSS tests set 45s per assertion
    sequence: {
      concurrent: false, // Serial execution — AWS API rate limits
    },
    watch: false,
  },
});
