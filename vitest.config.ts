import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['services/**/*.test.ts', 'services/**/*.property.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out', 'infra/readback/**'],
    reporters: ['verbose'],
    testTimeout: 60_000,
  },
});
