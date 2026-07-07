/**
 * Migration runner — executes numbered SQL migration files via RDS Data API.
 * Idempotent: tracks applied migrations in public._migrations table.
 * Each migration runs inside a transaction. Failed migrations abort the deploy.
 *
 * Per design §4: raw SQL + CDK Custom Resource; parameterized set_config (D-7).
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { createHash } from 'node:crypto';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'migration-runner' });

export interface MigrationConfig {
  clusterArn: string;
  secretArn: string;
  database: string;
}

export interface MigrationFile {
  filename: string;
  sql: string;
}

const client = new RDSDataClient({});

function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex').substring(0, 16);
}

async function executeStatement(
  config: MigrationConfig,
  sql: string,
  transactionId?: string,
): Promise<void> {
  await client.send(
    new ExecuteStatementCommand({
      resourceArn: config.clusterArn,
      secretArn: config.secretArn,
      database: config.database,
      sql,
      ...(transactionId ? { transactionId } : {}),
    }),
  );
}

async function getAppliedMigrations(config: MigrationConfig): Promise<Set<string>> {
  try {
    const result = await client.send(
      new ExecuteStatementCommand({
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        database: config.database,
        sql: 'SELECT filename FROM public._migrations',
      }),
    );
    const filenames = new Set<string>();
    for (const record of result.records ?? []) {
      if (record[0]?.stringValue) {
        filenames.add(record[0].stringValue);
      }
    }
    return filenames;
  } catch (err: unknown) {
    // Table might not exist on very first run
    const message = (err as Error).message ?? '';
    if (message.includes('_migrations') && message.includes('does not exist')) {
      return new Set();
    }
    throw err;
  }
}

export async function runMigrations(
  config: MigrationConfig,
  migrations: MigrationFile[],
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  // Sort by filename (numeric prefix ensures order)
  const sorted = [...migrations].sort((a, b) => a.filename.localeCompare(b.filename));

  const alreadyApplied = await getAppliedMigrations(config);

  for (const migration of sorted) {
    if (alreadyApplied.has(migration.filename)) {
      skipped.push(migration.filename);
      logger.info('Migration already applied, skipping', { filename: migration.filename });
      continue;
    }

    logger.info('Applying migration', { filename: migration.filename });

    const transactionId = (
      await client.send(
        new BeginTransactionCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          database: config.database,
        }),
      )
    ).transactionId!;

    try {
      // Execute the migration SQL
      await executeStatement(config, migration.sql, transactionId);

      // Record it in the _migrations table
      const checksum = computeChecksum(migration.sql);
      await executeStatement(
        config,
        `INSERT INTO public._migrations (filename, checksum) VALUES ('${migration.filename}', '${checksum}')`,
        transactionId,
      );

      await client.send(
        new CommitTransactionCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          transactionId,
        }),
      );

      applied.push(migration.filename);
      logger.info('Migration applied successfully', { filename: migration.filename });
    } catch (err) {
      logger.error('Migration failed, rolling back', {
        filename: migration.filename,
        error: (err as Error).message,
      });

      await client.send(
        new RollbackTransactionCommand({
          resourceArn: config.clusterArn,
          secretArn: config.secretArn,
          transactionId,
        }),
      );

      throw new Error(`Migration ${migration.filename} failed: ${(err as Error).message}`);
    }
  }

  return { applied, skipped };
}
