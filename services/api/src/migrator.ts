/**
 * CDK Custom Resource handler for database migrations.
 * Reads SQL files from the bundled migrations/ directory and executes them
 * via the migration-runner against Aurora PostgreSQL via Data API.
 *
 * Also syncs app_role password from its Secrets Manager secret (C-1).
 * Signals SUCCESS to CloudFormation on completion; FAILED on any migration error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@aws-lambda-powertools/logger';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data';
import { runMigrations, type MigrationFile } from './migration-runner.js';

const logger = new Logger({ serviceName: 'migrator' });

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!; // master secret (DDL)
const APP_ROLE_SECRET_ARN = process.env.APP_ROLE_SECRET_ARN!;
const DATABASE = process.env.DATABASE ?? 'postgres';

const smClient = new SecretsManagerClient({});
const rdsClient = new RDSDataClient({});

interface CdkCustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: Record<string, string>;
}

/**
 * Sync app_role password from Secrets Manager → PostgreSQL.
 * Uses master secret for the ALTER ROLE DDL statement.
 */
async function syncAppRolePassword(): Promise<void> {
  const secretValue = await smClient.send(
    new GetSecretValueCommand({ SecretId: APP_ROLE_SECRET_ARN }),
  );
  const parsed = JSON.parse(secretValue.SecretString!);
  const password = parsed.password as string;

  // Parameterized is not possible for ALTER ROLE PASSWORD in Data API
  // (DDL statement). The password is sourced from our own secret, not user input.
  // This is a deploy-time operation on the master connection only.
  await rdsClient.send(
    new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
      sql: `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
          ALTER ROLE app_role PASSWORD '${password.replace(/'/g, "''")}';
        END IF;
      END $$;`,
    }),
  );

  logger.info('app_role password synced from Secrets Manager');
}

export async function handler(event: CdkCustomResourceEvent): Promise<{ Data: Record<string, string> }> {
  logger.info('Migration handler invoked', { requestType: event.RequestType });

  // On Delete, nothing to do (we don't drop schemas)
  if (event.RequestType === 'Delete') {
    return { Data: { status: 'skipped', reason: 'Delete — no migration rollback' } };
  }

  // Load migration files from the bundled directory
  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const migrations: MigrationFile[] = files.map((filename) => ({
    filename,
    sql: readFileSync(join(migrationsDir, filename), 'utf-8'),
  }));

  logger.info('Found migration files', { count: migrations.length, files });

  const result = await runMigrations(
    { clusterArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DATABASE },
    migrations,
  );

  // After migrations complete (including 009 that creates app_role),
  // sync the password so resolvers can connect as app_role.
  await syncAppRolePassword();

  logger.info('Migrations complete', result);

  return {
    Data: {
      applied: result.applied.join(','),
      skipped: result.skipped.join(','),
      totalApplied: String(result.applied.length),
    },
  };
}
