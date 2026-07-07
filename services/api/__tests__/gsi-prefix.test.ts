/**
 * Repository-layer unit test: every GSI*PK attribute value written by resolvers
 * MUST be TENANT#-prefixed (FF-5 convention enforcement).
 *
 * This test scans all resolver source files for DynamoDB PutItem/GetItem/Query
 * patterns and asserts any GSI*PK value uses the TENANT# prefix.
 * Runs without deployed infrastructure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const RESOLVERS_DIR = resolve(__dirname, '../src/resolvers');
const SHARED_FILE = resolve(RESOLVERS_DIR, 'shared.ts');

describe('GSI*PK prefix convention (FF-5)', () => {
  it('shared.ts documents the DDB isolation pattern via tenant-data role', () => {
    const sharedCode = readFileSync(SHARED_FILE, 'utf-8');

    // The shared module uses getTenantDdbClient which sets a bare tenantId session tag.
    // The IAM LeadingKeys condition (in api-stack.ts) enforces TENANT#${tenantId}# prefix.
    // This test verifies the session tag mechanism is present.
    expect(sharedCode).toContain("Key: 'tenantId', Value: tenantId");
    expect(sharedCode).toContain('AssumeRoleCommand');
  });

  it('no resolver writes a GSI*PK value without TENANT# prefix', () => {
    const resolverFiles = readdirSync(RESOLVERS_DIR)
      .filter(f => f.endsWith('.ts') && f !== 'shared.ts' && f !== 'subscriptions.ts');

    const violations: string[] = [];

    for (const file of resolverFiles) {
      const content = readFileSync(resolve(RESOLVERS_DIR, file), 'utf-8');

      // Look for any DDB PutItem with GSI*PK attribute that doesn't use TENANT# prefix
      // Pattern: GSI1PK, GSI2PK, etc. in attribute names
      const gsiPkPattern = /GSI\dPK.*?['"`]([^'"`]+)['"`]/g;
      let match;
      while ((match = gsiPkPattern.exec(content)) !== null) {
        const value = match[1];
        if (!value.startsWith('TENANT#') && !value.includes('tenantId')) {
          violations.push(`${file}: GSI PK value "${value}" is not TENANT#-prefixed`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('IAM policy enforces TENANT# prefix via LeadingKeys (verified in api-stack.ts)', () => {
    // The TENANT# prefix is enforced at the IAM layer (infra/lib/api-stack.ts)
    // via the dynamodb:LeadingKeys condition. This test verifies the api-stack
    // contains the pattern. The live proof is ACC-2 (Task 14 GSI probe).
    const apiStackCode = readFileSync(resolve(__dirname, '../../../infra/lib/api-stack.ts'), 'utf-8');
    expect(apiStackCode).toContain('TENANT#${aws:PrincipalTag/tenantId}#*');
    expect(apiStackCode).toContain('dynamodb:LeadingKeys');
  });
});
