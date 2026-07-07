/**
 * CDK Custom Resource handler for database migrations.
 * Reads SQL files from the bundled migrations/ directory and executes them
 * via the migration-runner against Aurora PostgreSQL via Data API.
 *
 * Signals SUCCESS to CloudFormation on completion; FAILED on any migration error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@aws-lambda-powertools/logger';
import { runMigrations, type MigrationFile } from './migration-runner.js';

const logger = new Logger({ serviceName: 'migrator' });

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE = process.env.DATABASE ?? 'postgres';

interface CdkCustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: Record<string, string>;
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

  logger.info('Migrations complete', result);

  return {
    Data: {
      applied: result.applied.join(','),
      skipped: result.skipped.join(','),
      totalApplied: String(result.applied.length),
    },
  };
}
