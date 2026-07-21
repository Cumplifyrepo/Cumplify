/**
 * Build-time environment loader — reads cdk-outputs.json from repo root and
 * writes NEXT_PUBLIC_* variables for the frontend static export.
 *
 * CON-2: Endpoints/IDs come from a build-time script reading repo-root
 * cdk-outputs.json. Nothing hardcoded.
 *
 * Usage: Runs as prebuild/predev script in package.json.
 * Output: frontend/.env.local (git-ignored, consumed by Next.js)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../');
const OUTPUT_PATH = resolve(import.meta.dirname, '../.env.local');

// Early-exit guard: when NEXT_PUBLIC_* are already in the environment (pipeline CI
// via envFromCfnOutputs), skip cdk-outputs.json entirely — do NOT write .env.local
// with dev values into a staging/prod build. (SMOKE-2 design §2.6, A-2 REQUIRED)
const alreadySet =
  process.env.NEXT_PUBLIC_GRAPHQL_URL &&
  process.env.NEXT_PUBLIC_USER_POOL_ID &&
  process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;
if (alreadySet) {
  console.log('✓ NEXT_PUBLIC_* already in environment; skipping cdk-outputs.json.');
  process.exit(0);
}

let outputs;
try {
  const raw = readFileSync(resolve(ROOT, 'cdk-outputs.json'), 'utf-8');
  outputs = JSON.parse(raw);
} catch (e) {
  console.warn('⚠ cdk-outputs.json not found or invalid; using fallback env vars.');
  // Fallback for CI where cdk-outputs.json might not exist
  writeFileSync(
    OUTPUT_PATH,
    [
      'NEXT_PUBLIC_GRAPHQL_URL=http://localhost:4000/graphql',
      'NEXT_PUBLIC_USER_POOL_ID=us-east-1_LOCAL',
      'NEXT_PUBLIC_USER_POOL_CLIENT_ID=local-client-id',
    ].join('\n') + '\n',
  );
  process.exit(0);
}

// Extract from Dev-ApiStack and Dev-IdentityStack (m1 fix: use only PoolBId)
const apiStack = outputs['Dev-ApiStack'] || {};
const identityStack = outputs['Dev-IdentityStack'] || {};

const graphqlUrl = apiStack.GraphqlApiUrl;
const userPoolId = identityStack.PoolBId;
const userPoolClientId = identityStack.PoolBClientId;

if (!graphqlUrl || !userPoolId || !userPoolClientId) {
  console.error('❌ Missing required outputs from cdk-outputs.json:');
  if (!graphqlUrl) console.error('  - Dev-ApiStack.GraphqlApiUrl');
  if (!userPoolId) console.error('  - Dev-IdentityStack.PoolBId');
  if (!userPoolClientId) console.error('  - Dev-IdentityStack.PoolBClientId');
  process.exit(1);
}

const envContent =
  [
    `NEXT_PUBLIC_GRAPHQL_URL=${graphqlUrl}`,
    `NEXT_PUBLIC_USER_POOL_ID=${userPoolId}`,
    `NEXT_PUBLIC_USER_POOL_CLIENT_ID=${userPoolClientId}`,
  ].join('\n') + '\n';

writeFileSync(OUTPUT_PATH, envContent);
console.log('✓ frontend/.env.local written from cdk-outputs.json');
