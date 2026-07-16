import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['services/**/*.test.ts', 'services/**/*.property.test.ts', 'infra/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist', 'cdk.out', 'infra/readback/**', '**/*.int.test.ts'],
    reporters: ['verbose'],
    testTimeout: 60_000,
    // HERMETIC UNIT LANE (2026-07-11): unit tests must NEVER reach live AWS.
    // Fake credentials make any unmocked SDK client fail LOUDLY on every
    // machine (a publisher escapee passed for weeks on dev machines with
    // ambient ~/.aws creds and only failed in CodeBuild). Live-AWS tests
    // belong in the *.int.test.ts lane (vitest.int.config.ts).
    env: {
      AWS_ACCESS_KEY_ID: 'AKIA-HERMETIC-UNIT-LANE',
      AWS_SECRET_ACCESS_KEY: 'hermetic-unit-lane-no-real-aws',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      AWS_REGION: 'us-east-1',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
  },
});
