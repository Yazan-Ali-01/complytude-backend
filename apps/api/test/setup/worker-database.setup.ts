import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

// From apps/api/test/setup: ../../.. = project root when rootDir is apps/api
const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '../../../../scripts/migrations',
);

// Fast path only: Jest gives every test file a fresh module registry, so this resets per file.
// Applied migrations are tracked in the worker database itself (schema_migrations).
let initialized = false;

/**
 * Ensures the worker-specific database exists and has all migrations applied.
 * Idempotent across test files: like scripts/run-migrations.sh, it records each applied file in
 * public.schema_migrations and skips recorded ones, so a worker running a second file doesn't
 * re-run non-idempotent migrations.
 */
export async function ensureWorkerDatabase(): Promise<void> {
  if (initialized) {
    return;
  }

  const workerId = process.env.JEST_WORKER_ID ?? '1';
  const dbName = `test_w${workerId}`;
  if (!/^test_w\d+$/.test(dbName)) {
    throw new Error(`Invalid worker database name: ${dbName}`);
  }

  const configJson = fs.readFileSync(TEST_CONFIG_PATH, 'utf-8');
  const config: TestContainerConfig = JSON.parse(configJson);
  const { host, port, user, password } = config.postgres;

  // 1. Connect to postgres (default DB) and create worker database
  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    connectionTimeoutMillis: 10000,
  });

  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code: string }).code
        : '';
    if (code !== '42P04') {
      // 42P04 = duplicate_database
      throw err;
    }
  } finally {
    await adminClient.end();
  }

  // 2. Connect to worker database and run migrations
  const workerClient = new Client({
    host,
    port,
    user,
    password,
    database: dbName,
    connectionTimeoutMillis: 10000,
  });

  await workerClient.connect();

  try {
    await workerClient.query(
      `CREATE TABLE IF NOT EXISTS public.schema_migrations (
         migration_name VARCHAR(255) PRIMARY KEY,
         executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );
    const applied = new Set(
      (
        await workerClient.query<{ migration_name: string }>(
          'SELECT migration_name FROM public.schema_migrations',
        )
      ).rows.map((row) => row.migration_name),
    );

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (applied.has(file)) continue;
      // Migration files manage their own transactions (BEGIN/COMMIT), as with run-migrations.sh
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await workerClient.query(sql);
      await workerClient.query(
        'INSERT INTO public.schema_migrations (migration_name) VALUES ($1)',
        [file],
      );
    }
  } finally {
    await workerClient.end();
  }

  initialized = true;
}
