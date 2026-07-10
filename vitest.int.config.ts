import { defineConfig } from 'vitest/config';

/**
 * Integration-test config. The default `vitest run` EXCLUDES *.int.test.ts
 * (they need live AWS + credentials). CI runs these in a separate job with
 * dev credentials:
 *
 *   C7_AWS_PROFILE=cumplify-dev-admin npm run test:int          # all int tests
 *   npm run test:int -- services/api/__tests__/cross-tenant-denial.int.test.ts
 *
 * In CI set C7_AWS_PROFILE='' to use the ambient job role.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['services/**/*.int.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out'],
    reporters: ['verbose'],
    testTimeout: 120_000,
  },
});
