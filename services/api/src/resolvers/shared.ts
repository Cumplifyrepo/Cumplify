/**
 * Shared resolver utilities — Data API + STS tenant context.
 *
 * TWO isolation paths (never conflated):
 *   1. RDS (system-of-record): Data API with app_role, transaction-local set_config.
 *   2. DynamoDB (metadata): Assumed tenant-data role with bare tenantId session tag.
 *
 * C-2 INVARIANT (review-blocking): set_config('app.tenant_id', :tenantId, true)
 * MUST be the FIRST statement in every BeginTransaction. Never `false`. Never a
 * bare ExecuteStatement for tenant-scoped data.
 *
 * SCHEMA-5: tenantId comes ONLY from resolverContext. Client-supplied tenantId
 * in mutation input is overwritten/rejected.
 */

import {
  RDSDataClient,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  ExecuteStatementCommand,
  type SqlParameter,
} from '@aws-sdk/client-rds-data';
import {
  STSClient,
  AssumeRoleCommand,
} from '@aws-sdk/client-sts';
import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { publish } from '../../../eventing/src/publisher.js';

const rdsClient = new RDSDataClient({});
const stsClient = new STSClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const APP_ROLE_SECRET_ARN = process.env.APP_ROLE_SECRET_ARN!;
const TABLE_NAME = process.env.TABLE_NAME!;
const BUS_NAME = process.env.BUS_NAME!;
const TENANT_DATA_ROLE_ARN = process.env.TENANT_DATA_ROLE_ARN!;

// ─── Tenant-scoped DDB credential cache (per warm container) ─────────────────
interface CachedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number; // epoch ms
}

const credentialCache = new Map<string, CachedCredentials>();

/**
 * Assume the tenant-data role with a bare tenantId session tag.
 * Returns a DynamoDB client scoped to the tenant's partition.
 * Caches credentials per tenantId for up to 10 minutes.
 */
export async function getTenantDdbClient(tenantId: string): Promise<DynamoDBClient> {
  const cached = credentialCache.get(tenantId);
  const now = Date.now();

  // Reuse if >2 min remaining (buffer for clock drift)
  if (cached && cached.expiration - now > 120_000) {
    return new DynamoDBClient({
      credentials: {
        accessKeyId: cached.accessKeyId,
        secretAccessKey: cached.secretAccessKey,
        sessionToken: cached.sessionToken,
      },
    });
  }

  const assumed = await stsClient.send(new AssumeRoleCommand({
    RoleArn: TENANT_DATA_ROLE_ARN,
    RoleSessionName: `resolver-${tenantId.substring(0, 8)}-${now}`,
    Tags: [{ Key: 'tenantId', Value: tenantId }], // BARE tenantId (FF-3)
    DurationSeconds: 900,
  }));

  const creds: CachedCredentials = {
    accessKeyId: assumed.Credentials!.AccessKeyId!,
    secretAccessKey: assumed.Credentials!.SecretAccessKey!,
    sessionToken: assumed.Credentials!.SessionToken!,
    expiration: assumed.Credentials!.Expiration!.getTime(),
  };

  credentialCache.set(tenantId, creds);

  return new DynamoDBClient({
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

// ─── RDS Data API tenant-scoped transaction ──────────────────────────────────

export interface TenantTransaction {
  transactionId: string;
  execute: (sql: string, parameters?: SqlParameter[]) => Promise<unknown>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

/**
 * Begin a tenant-scoped RDS transaction.
 * C-2 INVARIANT: set_config is the FIRST statement, transaction-local (true).
 * Uses app_role secret (NEVER master) for Data API.
 */
export async function beginTenantTransaction(tenantId: string): Promise<TenantTransaction> {
  const { transactionId } = await rdsClient.send(new BeginTransactionCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: APP_ROLE_SECRET_ARN,
    database: 'postgres',
  }));

  // C-2 INVARIANT: set_config is the FIRST statement in every transaction.
  // Third arg = true → transaction-local. Connection reuse is safe.
  await rdsClient.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: APP_ROLE_SECRET_ARN,
    database: 'postgres',
    transactionId: transactionId!,
    sql: `SELECT set_config('app.tenant_id', :tenantId, true)`,
    parameters: [{ name: 'tenantId', value: { stringValue: tenantId } }],
  }));

  const execute = async (sql: string, parameters?: SqlParameter[]) => {
    const result = await rdsClient.send(new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: APP_ROLE_SECRET_ARN,
      database: 'postgres',
      transactionId: transactionId!,
      sql,
      parameters,
    }));
    return result;
  };

  const commit = async () => {
    await rdsClient.send(new CommitTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: APP_ROLE_SECRET_ARN,
      transactionId: transactionId!,
    }));
  };

  const rollback = async () => {
    await rdsClient.send(new RollbackTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: APP_ROLE_SECRET_ARN,
      transactionId: transactionId!,
    }));
  };

  return { transactionId: transactionId!, execute, commit, rollback };
}

// ─── Event publishing helper ─────────────────────────────────────────────────

export interface PublishAuditEventOptions {
  tenantId: string;
  actor: string;
  module: string;
  clauseRef: string;
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
  detailType: string;
  source: string;
  payload: Record<string, unknown>;
}

export async function publishAuditEvent(opts: PublishAuditEventOptions): Promise<string> {
  return publish({
    busName: BUS_NAME,
    source: opts.source,
    detailType: opts.detailType,
    event: {
      tenantId: opts.tenantId,
      timestamp: new Date().toISOString(),
      actor: opts.actor,
      module: opts.module,
      clauseRef: opts.clauseRef,
      standard: opts.standard,
      payload: opts.payload,
    },
  });
}

// ─── Resolver context extraction ─────────────────────────────────────────────

export interface ResolverContext {
  tenantId: string;
  role: string;
  poolClass: string;
  sub: string;
  entitlement: string;
}

/**
 * Extract and validate resolverContext from AppSync event.
 * SCHEMA-5: tenantId comes ONLY from resolverContext — never from input args.
 */
export function extractContext(event: { identity?: { resolverContext?: Record<string, string> } }): ResolverContext {
  const ctx = event.identity?.resolverContext;
  if (!ctx?.tenantId) {
    throw new Error('Missing resolverContext.tenantId — authorization failed');
  }
  return {
    tenantId: ctx.tenantId,
    role: ctx.role ?? 'Employee',
    poolClass: ctx.poolClass ?? 'tenant-user',
    sub: ctx.sub ?? 'unknown',
    entitlement: ctx.entitlement ?? '{}',
  };
}

export { TABLE_NAME, BUS_NAME, CLUSTER_ARN, Logger };
