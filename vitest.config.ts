import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['services/**/*.test.ts', 'services/**/*.property.test.ts', 'infra/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out'],
    reporters: ['verbose'],
    testTimeout: 60_000,
  },
});
