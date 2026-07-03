/**
 * Readback assertions — Spec 1 platform-foundation
 * Design §7: R-1 through R-23
 *
 * Run-mode semantics:
 * - Dev-NetworkStack not deployed → assertions register as vitest SKIPPED.
 * - Dev-NetworkStack deployed → post-deploy mode, ABSENT = FAIL.
 *
 * Env-conditional: R-21, R-22 are prod-only (skip on dev).
 * R-11 (AOSS CollectionStatus=ACTIVE) uses 45s timeout budget per 02-aoss-rule.
 *
 * @dev — requires cumplify-dev-readonly profile for live account assertions.
 */

import { describe, it, beforeAll } from 'vitest';
import { assertResource } from './helpers.js';

const PROFILE = 'cumplify-dev-readonly';
const ENV_NAME: string = 'dev';
const AOSS_TIMEOUT = 45_000; // 45s cold-start budget per 02-aoss-rule

// ---------------------------------------------------------------------------
// AWS CLI helper — runs a command and returns parsed JSON or null on failure
// ---------------------------------------------------------------------------

async function awsJson<T>(command: string, timeout = 15_000): Promise<T | null> {
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(`${command} --profile ${PROFILE} --output json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });
    return JSON.parse(output) as T;
  } catch {
    return null;
  }
}

async function hasAwsAccess(): Promise<boolean> {
  const result = await awsJson<{ Account: string }>('aws sts get-caller-identity', 10_000);
  return result !== null;
}

async function getVpcIdFromStack(): Promise<string | null> {
  const result = await awsJson<string[]>(
    `aws cloudformation describe-stack-resources --stack-name Dev-NetworkStack --query "StackResources[?ResourceType=='AWS::EC2::VPC'].PhysicalResourceId"`,
  );
  return result && result.length > 0 ? result[0] : null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Platform Foundation — Readback Assertions', () => {
  let awsAvailable = false;
  let specStacksDeployed = false;

  beforeAll(async () => {
    awsAvailable = await hasAwsAccess();
    if (!awsAvailable) return;
    const vpcId = await getVpcIdFromStack();
    specStacksDeployed = vpcId !== null;
  });

  /** Skip helper for all assertions */
  function skipIfNotDeployed(ctx: { skip: () => void }): boolean {
    if (!awsAvailable || !specStacksDeployed) {
      ctx.skip();
      return true;
    }
    return false;
  }

  // =========================================================================
  // DynamoDB assertions (R-1 through R-4)
  // =========================================================================

  it('R-1: CumplifyCore table SSE.Type = KMS', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ Table: { SSEDescription?: { SSEType?: string } } }>(
      'aws dynamodb describe-table --table-name CumplifyCore --query "{Table: {SSEDescription: Table.SSEDescription}}"',
    );
    const observed = result?.Table?.SSEDescription?.SSEType ?? 'ABSENT';
    assertResource('dynamodb:table/CumplifyCore', 'SSE.Type', 'KMS', observed);
  });

  it('R-2: CumplifyCore table SSE.KMSMasterKeyArn contains dynamodb CMK', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ Table: { SSEDescription?: { KMSMasterKeyArn?: string } } }>(
      'aws dynamodb describe-table --table-name CumplifyCore --query "{Table: {SSEDescription: Table.SSEDescription}}"',
    );
    const arn = result?.Table?.SSEDescription?.KMSMasterKeyArn ?? 'ABSENT';
    // Verify it's a real KMS ARN (not default AWS-owned)
    const isCustomKey = typeof arn === 'string' && arn.includes(':key/');
    assertResource(
      'dynamodb:table/CumplifyCore',
      'SSE.KMSMasterKeyArn.isCustomKey',
      true,
      isCustomKey,
    );
  });

  it('R-3: CumplifyCore table has 9 GSIs', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ Table: { GlobalSecondaryIndexes?: unknown[] } }>(
      'aws dynamodb describe-table --table-name CumplifyCore --query "{Table: {GlobalSecondaryIndexes: Table.GlobalSecondaryIndexes}}"',
    );
    const count = result?.Table?.GlobalSecondaryIndexes?.length ?? 'ABSENT';
    assertResource('dynamodb:table/CumplifyCore', 'GlobalSecondaryIndexes.length', 9, count);
  });

  it('R-4: CumplifyCore table PITR enabled', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{
      ContinuousBackupsDescription?: {
        PointInTimeRecoveryDescription?: { PointInTimeRecoveryStatus?: string };
      };
    }>('aws dynamodb describe-continuous-backups --table-name CumplifyCore');
    const status =
      result?.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
        ?.PointInTimeRecoveryStatus ?? 'ABSENT';
    assertResource('dynamodb:table/CumplifyCore', 'PointInTimeRecoveryStatus', 'ENABLED', status);
  });

  // =========================================================================
  // S3 Evidence Vault (R-5, R-6)
  // =========================================================================

  it('R-5: S3 evidence vault ObjectLock Mode = COMPLIANCE', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const bucketName = `cumplify-${ENV_NAME}-evidence`;
    const result = await awsJson<{
      ObjectLockConfiguration?: {
        ObjectLockEnabled?: string;
        Rule?: { DefaultRetention?: { Mode?: string } };
      };
    }>(`aws s3api get-object-lock-configuration --bucket ${bucketName}`);
    const mode = result?.ObjectLockConfiguration?.Rule?.DefaultRetention?.Mode ?? 'ABSENT';
    assertResource(`s3://${bucketName}`, 'ObjectLockConfiguration.Mode', 'COMPLIANCE', mode);
  });

  it('R-6: S3 evidence vault retention = 2555 days', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const bucketName = `cumplify-${ENV_NAME}-evidence`;
    const result = await awsJson<{
      ObjectLockConfiguration?: { Rule?: { DefaultRetention?: { Days?: number } } };
    }>(`aws s3api get-object-lock-configuration --bucket ${bucketName}`);
    const days = result?.ObjectLockConfiguration?.Rule?.DefaultRetention?.Days ?? 'ABSENT';
    assertResource(
      `s3://${bucketName}`,
      'ObjectLockConfiguration.DefaultRetention.Days',
      2555,
      days,
    );
  });

  // =========================================================================
  // VPC (R-7, R-8, R-9, R-23)
  // =========================================================================

  it('R-7: VPC has zero NAT gateways', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const vpcId = await getVpcIdFromStack();
    const result = await awsJson<{ NatGateways?: unknown[] }>(
      `aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=${vpcId}" "Name=state,Values=available"`,
    );
    const count = result?.NatGateways?.length ?? 'ABSENT';
    assertResource(`ec2:vpc/${vpcId}`, 'NatGateways.length', 0, count);
  });

  it('R-8: VPC has 5 interface endpoints (AOSS, SecretsManager, KMS, bedrock-runtime, execute-api)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const vpcId = await getVpcIdFromStack();
    const result = await awsJson<{
      VpcEndpoints?: Array<{ ServiceName?: string; VpcEndpointType?: string }>;
    }>(
      `aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=${vpcId}" "Name=vpc-endpoint-type,Values=Interface"`,
    );
    const endpoints = result?.VpcEndpoints ?? [];
    const serviceNames = endpoints.map((e) => e.ServiceName ?? '').sort();
    const expected = ['aoss', 'bedrock-runtime', 'execute-api', 'kms', 'secretsmanager'];
    const found = expected.filter((svc) => serviceNames.some((s) => s.includes(svc)));
    assertResource(`ec2:vpc/${vpcId}`, 'InterfaceEndpoints.count', 5, found.length);
  });

  it('R-9: VPC has 2 gateway endpoints (S3, DynamoDB)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const vpcId = await getVpcIdFromStack();
    const result = await awsJson<{
      VpcEndpoints?: Array<{ ServiceName?: string; VpcEndpointType?: string }>;
    }>(
      `aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=${vpcId}" "Name=vpc-endpoint-type,Values=Gateway"`,
    );
    const endpoints = result?.VpcEndpoints ?? [];
    const count = endpoints.length;
    assertResource(`ec2:vpc/${vpcId}`, 'GatewayEndpoints.count', 2, count);
  });

  it('R-23: FlowLog exists for CumplifyVpc', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const vpcId = await getVpcIdFromStack();
    const result = await awsJson<{ FlowLogs?: unknown[] }>(
      `aws ec2 describe-flow-logs --filter "Name=resource-id,Values=${vpcId}"`,
    );
    const hasFlowLog = (result?.FlowLogs?.length ?? 0) > 0;
    assertResource(`ec2:vpc/${vpcId}`, 'FlowLog.exists', true, hasFlowLog);
  });

  // =========================================================================
  // AOSS (R-10, R-11)
  // =========================================================================

  it('R-10: AOSS collection type = VECTORSEARCH', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{
      collectionDetails?: Array<{ type?: string }>;
    }>('aws opensearchserverless batch-get-collection --names cumplify-iso-kb', AOSS_TIMEOUT);
    const type = result?.collectionDetails?.[0]?.type ?? 'ABSENT';
    assertResource('aoss:collection/cumplify-iso-kb', 'Type', 'VECTORSEARCH', type);
  });

  it('R-11: AOSS collection status = ACTIVE (45s budget)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    // AOSS scale-to-zero cold start up to 45s — use extended timeout
    const result = await awsJson<{
      collectionDetails?: Array<{ status?: string }>;
    }>('aws opensearchserverless batch-get-collection --names cumplify-iso-kb', AOSS_TIMEOUT);
    const status = result?.collectionDetails?.[0]?.status ?? 'ABSENT';
    assertResource('aoss:collection/cumplify-iso-kb', 'CollectionStatus', 'ACTIVE', status);
  });

  // =========================================================================
  // Aurora (R-12, R-13)
  // =========================================================================

  it('R-12: Aurora cluster StorageEncrypted = true', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ DBClusters?: Array<{ StorageEncrypted?: boolean }> }>(
      "aws rds describe-db-clusters --query \"{DBClusters: DBClusters[?contains(DBClusterIdentifier, 'cumplify') || contains(DBClusterIdentifier, 'datastack')]}\"",
    );
    const encrypted = result?.DBClusters?.[0]?.StorageEncrypted ?? 'ABSENT';
    assertResource('rds:cluster/cumplify', 'StorageEncrypted', true, encrypted);
  });

  it('R-13: Aurora cluster ServerlessV2 MinCapacity = 0 (dev)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{
      DBClusters?: Array<{ ServerlessV2ScalingConfiguration?: { MinCapacity?: number } }>;
    }>(
      "aws rds describe-db-clusters --query \"{DBClusters: DBClusters[?contains(DBClusterIdentifier, 'cumplify') || contains(DBClusterIdentifier, 'datastack')]}\"",
    );
    const minCap =
      result?.DBClusters?.[0]?.ServerlessV2ScalingConfiguration?.MinCapacity ?? 'ABSENT';
    assertResource('rds:cluster/cumplify', 'ServerlessV2ScalingConfig.MinCapacity', 0, minCap);
  });

  // =========================================================================
  // ElastiCache (R-14, R-15)
  // =========================================================================

  it('R-14: ElastiCache AtRestEncryptionEnabled = true', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{
      ReplicationGroups?: Array<{ AtRestEncryptionEnabled?: boolean }>;
    }>('aws elasticache describe-replication-groups');
    const group = result?.ReplicationGroups?.find((g) =>
      JSON.stringify(g).toLowerCase().includes('cumplify'),
    );
    const enabled = group?.AtRestEncryptionEnabled ?? 'ABSENT';
    assertResource('elasticache:cumplify', 'AtRestEncryptionEnabled', true, enabled);
  });

  it('R-15: ElastiCache TransitEncryptionEnabled = true', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{
      ReplicationGroups?: Array<{ TransitEncryptionEnabled?: boolean }>;
    }>('aws elasticache describe-replication-groups');
    const group = result?.ReplicationGroups?.find((g) =>
      JSON.stringify(g).toLowerCase().includes('cumplify'),
    );
    const enabled = group?.TransitEncryptionEnabled ?? 'ABSENT';
    assertResource('elasticache:cumplify', 'TransitEncryptionEnabled', true, enabled);
  });

  // =========================================================================
  // Cognito (R-16, R-17, R-18)
  // =========================================================================

  it('R-16: Cognito Pool A MfaConfiguration = ON', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const poolName = `cumplify-${ENV_NAME}-internal`;
    const pools = await awsJson<{ UserPools?: Array<{ Id?: string; Name?: string }> }>(
      `aws cognito-idp list-user-pools --max-results 60 --query "{UserPools: UserPools[?Name=='${poolName}']}"`,
    );
    const poolId = pools?.UserPools?.[0]?.Id;
    if (!poolId) {
      assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'ON', 'ABSENT');
      return;
    }
    const detail = await awsJson<{ UserPool?: { MfaConfiguration?: string } }>(
      `aws cognito-idp describe-user-pool --user-pool-id ${poolId}`,
    );
    const mfa = detail?.UserPool?.MfaConfiguration ?? 'ABSENT';
    assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'ON', mfa);
  });

  it('R-17: Cognito Pool B MfaConfiguration = OPTIONAL', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const poolName = `cumplify-${ENV_NAME}-tenant-admin`;
    const pools = await awsJson<{ UserPools?: Array<{ Id?: string; Name?: string }> }>(
      `aws cognito-idp list-user-pools --max-results 60 --query "{UserPools: UserPools[?Name=='${poolName}']}"`,
    );
    const poolId = pools?.UserPools?.[0]?.Id;
    if (!poolId) {
      assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'OPTIONAL', 'ABSENT');
      return;
    }
    const detail = await awsJson<{ UserPool?: { MfaConfiguration?: string } }>(
      `aws cognito-idp describe-user-pool --user-pool-id ${poolId}`,
    );
    const mfa = detail?.UserPool?.MfaConfiguration ?? 'ABSENT';
    assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'OPTIONAL', mfa);
  });

  it('R-18: Cognito Pool C MfaConfiguration = OPTIONAL', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const poolName = `cumplify-${ENV_NAME}-tenant-user`;
    const pools = await awsJson<{ UserPools?: Array<{ Id?: string; Name?: string }> }>(
      `aws cognito-idp list-user-pools --max-results 60 --query "{UserPools: UserPools[?Name=='${poolName}']}"`,
    );
    const poolId = pools?.UserPools?.[0]?.Id;
    if (!poolId) {
      assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'OPTIONAL', 'ABSENT');
      return;
    }
    const detail = await awsJson<{ UserPool?: { MfaConfiguration?: string } }>(
      `aws cognito-idp describe-user-pool --user-pool-id ${poolId}`,
    );
    const mfa = detail?.UserPool?.MfaConfiguration ?? 'ABSENT';
    assertResource(`cognito:${poolName}`, 'MfaConfiguration', 'OPTIONAL', mfa);
  });

  // =========================================================================
  // KMS (R-19, R-20)
  // =========================================================================

  it('R-19: 10 KMS keys with alias prefix cumplify/<env>/', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ Aliases?: Array<{ AliasName?: string }> }>(
      'aws kms list-aliases --query "{Aliases: Aliases}"',
    );
    const prefix = `alias/cumplify/${ENV_NAME}/`;
    const matched = (result?.Aliases ?? []).filter((a) => a.AliasName?.startsWith(prefix));
    assertResource(`kms:aliases/${prefix}*`, 'count', 10, matched.length);
  });

  it('R-20: All cumplify KMS keys have rotation enabled', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    const result = await awsJson<{ Aliases?: Array<{ AliasName?: string; TargetKeyId?: string }> }>(
      'aws kms list-aliases --query "{Aliases: Aliases}"',
    );
    const prefix = `alias/cumplify/${ENV_NAME}/`;
    const aliases = (result?.Aliases ?? []).filter((a) => a.AliasName?.startsWith(prefix));

    let allRotating = true;
    for (const alias of aliases) {
      if (!alias.TargetKeyId) continue;
      const keyResult = await awsJson<{ KeyRotationEnabled?: boolean }>(
        `aws kms get-key-rotation-status --key-id ${alias.TargetKeyId}`,
      );
      if (keyResult?.KeyRotationEnabled !== true) {
        allRotating = false;
        break;
      }
    }
    assertResource(`kms:aliases/${prefix}*`, 'KeyRotationEnabled(all)', true, allRotating);
  });

  // =========================================================================
  // Prod-only (R-21, R-22) — skip on dev/staging
  // =========================================================================

  it('R-21: Global Table replica status us-west-2 = ACTIVE (prod-only)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    if (ENV_NAME !== 'prod') {
      ctx.skip();
      return;
    }
    const result = await awsJson<{
      Table?: { Replicas?: Array<{ RegionName?: string; ReplicaStatus?: string }> };
    }>(
      'aws dynamodb describe-table --table-name CumplifyCore --query "{Table: {Replicas: Table.Replicas}}"',
    );
    const replica = result?.Table?.Replicas?.find((r) => r.RegionName === 'us-west-2');
    const status = replica?.ReplicaStatus ?? 'ABSENT';
    assertResource('dynamodb:table/CumplifyCore', 'Replica.us-west-2.Status', 'ACTIVE', status);
  });

  it('R-22: DR KMS ReplicaKey exists in us-west-2 (prod-only)', async (ctx) => {
    if (skipIfNotDeployed(ctx)) return;
    if (ENV_NAME !== 'prod') {
      ctx.skip();
      return;
    }
    const result = await awsJson<{ Aliases?: Array<{ AliasName?: string }> }>(
      `aws kms list-aliases --region us-west-2 --query "{Aliases: Aliases}"`,
    );
    const prefix = `alias/cumplify/prod/dynamodb`;
    const found = (result?.Aliases ?? []).some((a) => a.AliasName === prefix);
    assertResource('kms:us-west-2/cumplify/prod/dynamodb', 'exists', true, found);
  });
});
