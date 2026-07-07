/**
 * ApiStack template assertion tests.
 * Verifies resolver count matches schema fields (BLOCK-1 prevention).
 *
 * NOTE: Full CDK synthesis of ApiStack requires Lambda entry points and schema
 * file resolution. This test reads the source file to assert structural properties
 * without full synth (which is tested by `cdk synth` in CI).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_STACK_CODE = readFileSync(resolve(__dirname, 'api-stack.ts'), 'utf-8');
const SCHEMA_CODE = readFileSync(resolve(__dirname, '../../services/api/schema/schema.graphql'), 'utf-8');

describe('ApiStack template assertions (source-level)', () => {
  it('has createResolver calls for all Query fields in schema', () => {
    // Count Query fields in schema (one per line with a field name)
    const querySection = SCHEMA_CODE.match(/type Query \{([^}]+)\}/s);
    expect(querySection).not.toBeNull();
    const queryLines = querySection![1].split('\n').filter(l => l.match(/^\s+\w+[\(:]/));
    const queryFieldCount = queryLines.length;

    // Count Query resolver attachments in api-stack
    const queryResolvers = API_STACK_CODE.match(/typeName: 'Query'/g) ?? [];

    expect(queryResolvers.length).toBe(queryFieldCount);
  });

  it('has createResolver calls for all Mutation fields in schema', () => {
    // Count Mutation fields in schema (one per line with a field name)
    const mutationSection = SCHEMA_CODE.match(/type Mutation \{([^}]+)\}/s);
    expect(mutationSection).not.toBeNull();
    // Count lines that have a field definition (word followed by '(' or ':')
    const mutationLines = mutationSection![1].split('\n').filter(l => l.match(/^\s+\w+[\(:]/));
    const mutationFieldCount = mutationLines.length;

    // Count Mutation resolver attachments in api-stack
    const mutationResolvers = API_STACK_CODE.match(/typeName: 'Mutation'/g) ?? [];

    expect(mutationResolvers.length).toBe(mutationFieldCount);
  });

  it('has NoneDataSource for subscription publish mutations', () => {
    expect(API_STACK_CODE).toContain("api.addNoneDataSource('NoneDataSource')");
    expect(API_STACK_CODE).toContain("fieldName: 'publishDocumentEvent'");
    expect(API_STACK_CODE).toContain("fieldName: 'publishCAPAEvent'");
    expect(API_STACK_CODE).toContain("fieldName: 'publishAuditEvent'");
    expect(API_STACK_CODE).toContain("fieldName: 'publishRiskEvent'");
  });

  it('has Lambda data sources for all 5 modules', () => {
    expect(API_STACK_CODE).toContain("api.addLambdaDataSource('M1DataSource'");
    expect(API_STACK_CODE).toContain("api.addLambdaDataSource('M2DataSource'");
    expect(API_STACK_CODE).toContain("api.addLambdaDataSource('M3DataSource'");
    expect(API_STACK_CODE).toContain("api.addLambdaDataSource('M4DataSource'");
    expect(API_STACK_CODE).toContain("api.addLambdaDataSource('M5DataSource'");
  });

  it('has WAFv2 association', () => {
    expect(API_STACK_CODE).toContain('CfnWebACLAssociation');
  });

  it('has AppSync API with AWS_LAMBDA default auth + IAM additional', () => {
    expect(API_STACK_CODE).toContain('AuthorizationType.LAMBDA');
    expect(API_STACK_CODE).toContain('AuthorizationType.IAM');
  });

  it('has 4+ CfnOutputs (API URL, API ID, Authorizer ARN, TenantDataRole ARN)', () => {
    expect(API_STACK_CODE).toContain("'GraphqlApiUrl'");
    expect(API_STACK_CODE).toContain("'GraphqlApiId'");
    expect(API_STACK_CODE).toContain("'AuthorizerArn'");
    expect(API_STACK_CODE).toContain("'TenantDataRoleArn'");
  });

  it('excludeVerboseContent is true (FIX-2)', () => {
    expect(API_STACK_CODE).toContain('excludeVerboseContent: true');
  });

  it('tenant-data role has DENY for # in tag value (FIX-4)', () => {
    expect(API_STACK_CODE).toContain("'aws:RequestTag/tenantId': '*#*'");
    expect(API_STACK_CODE).toContain('Effect.DENY');
  });
});
