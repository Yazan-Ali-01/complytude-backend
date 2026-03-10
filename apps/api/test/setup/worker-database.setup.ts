import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { TEST_CONFIG_PATH, TestContainerConfig } from '../helpers/test-config';

// From apps/api/test/setup: ../../.. = project root when rootDir is apps/api
const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '../../../../scripts/migrations',
);

let initialized = false;

/**
 * Ensures the worker-specific database exists and has all migrations applied.
 * Idempotent — runs once per Jest worker (guarded by module-level flag).
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
    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await workerClient.query(sql);
    }
  } finally {
    await workerClient.end();
  }

  initialized = true;
}
