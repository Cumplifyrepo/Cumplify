import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Test load-env.mjs output — verifies the build-time env loader correctly
 * reads cdk-outputs.json and writes the expected NEXT_PUBLIC_* variables.
 */

describe('load-env.mjs', () => {
  const frontendDir = resolve(__dirname, '../..');
  const envLocalPath = resolve(frontendDir, '.env.local');

  it('generates .env.local from cdk-outputs.json with correct keys', () => {
    // Run the script
    execSync('node scripts/load-env.mjs', { cwd: frontendDir });

    const content = readFileSync(envLocalPath, 'utf-8');

    expect(content).toContain('NEXT_PUBLIC_GRAPHQL_URL=');
    expect(content).toContain('NEXT_PUBLIC_USER_POOL_ID=');
    expect(content).toContain('NEXT_PUBLIC_USER_POOL_CLIENT_ID=');

    // Values from cdk-outputs.json
    expect(content).toContain('NEXT_PUBLIC_GRAPHQL_URL=https://42yckio3gbbgphpdkpl7vux3v4.appsync-api.us-east-1.amazonaws.com/graphql');
    expect(content).toContain('NEXT_PUBLIC_USER_POOL_ID=us-east-1_cmiNNOAst');
    expect(content).toContain('NEXT_PUBLIC_USER_POOL_CLIENT_ID=662fm2cthctp150bo5sa7i5o43');
  });

  it('uses PoolBId key (not ExportsOutputRef fallback)', () => {
    execSync('node scripts/load-env.mjs', { cwd: frontendDir });
    const content = readFileSync(envLocalPath, 'utf-8');
    // The value should come from PoolBId, which is us-east-1_cmiNNOAst
    expect(content).toContain('NEXT_PUBLIC_USER_POOL_ID=us-east-1_cmiNNOAst');
  });
});
