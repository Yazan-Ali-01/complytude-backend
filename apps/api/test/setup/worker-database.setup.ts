import * as fs from 'fs';
import { Client } from 'pg';
import { runMigrations } from '../../../../scripts/migrate';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

// Fast path only: Jest gives every test file a fresh module registry, so this resets per file.
// Applied migrations are tracked in the worker database itself (schema_migrations).
let initialized = false;

/**
 * Ensures the worker-specific database exists and has all migrations applied, with the real runner
 * (scripts/migrate.ts): applied files are recorded in public.schema_migrations and skipped, so a
 * worker running a second test file doesn't re-run them.
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
    // The same runner as pnpm db:migrate and the deploy pipeline
    await runMigrations(workerClient);
  } finally {
    await workerClient.end();
  }

  initialized = true;
}
