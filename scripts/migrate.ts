/**
 * Database migration runner, shared by `pnpm db:migrate`, the deploy pipeline and the test harness.
 *
 * - Each migration runs in one transaction together with its `schema_migrations` row, so a file is
 *   either applied and recorded or neither (a crash or cancel in between can't wedge the next run).
 * - Each applied file's SHA-256 is recorded. A run fails before touching anything if an applied
 *   file has changed: applied migrations are never edited, changes go in a new numbered file.
 * - A session advisory lock serialises concurrent runners (CI and a manual run).
 *
 * Usage:
 *   ts-node scripts/migrate.ts          apply pending migrations
 *   ts-node scripts/migrate.ts --check  only verify that no applied migration changed
 *
 * Connection: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (the migration role, not the app role).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client, type ClientBase } from 'pg';

export const MIGRATIONS_DIR = resolve(__dirname, 'migrations');

/** Arbitrary constant: every runner takes the same advisory lock. */
const MIGRATION_LOCK_KEY = 7_214_092_263;

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export class ChangedMigrationError extends Error {
  constructor(readonly files: string[]) {
    super(
      `Applied migrations were edited: ${files.join(', ')}. ` +
        'Never change an applied migration; restore it and put the change in a new numbered file.',
    );
    this.name = 'ChangedMigrationError';
  }
}

export function readMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), 'utf8');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

/**
 * The file's statements without its own top-level `BEGIN;` / `COMMIT;` lines, so the runner can
 * run them and the bookkeeping row in one transaction. Lines inside block comments (the
 * commented-out rollback scripts) are left alone. A file must have exactly one of each.
 */
export function withoutOwnTransaction(file: MigrationFile): string {
  let inComment = false;
  let begins = 0;
  let commits = 0;
  const lines = file.sql.split('\n').map((line) => {
    const trimmed = line.trim();
    if (inComment) {
      if (trimmed.includes('*/')) inComment = false;
      return line;
    }
    if (trimmed.startsWith('/*')) {
      inComment = !trimmed.includes('*/');
      return line;
    }
    if (/^BEGIN\s*;\s*(--.*)?$/i.test(trimmed)) {
      begins++;
      return `-- ${line}`;
    }
    if (/^COMMIT\s*;\s*(--.*)?$/i.test(trimmed)) {
      commits++;
      return `-- ${line}`;
    }
    return line;
  });
  if (begins > 1 || commits > 1 || begins !== commits) {
    throw new Error(
      `${file.name}: expected at most one top-level BEGIN; and COMMIT; (found ${begins} and ${commits})`,
    );
  }
  return lines.join('\n');
}

async function ensureTrackingTable(client: ClientBase): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.schema_migrations (
       migration_name VARCHAR(255) PRIMARY KEY,
       executed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
  // Older databases recorded names only
  await client.query(
    'ALTER TABLE public.schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT',
  );
}

async function appliedChecksums(
  client: ClientBase,
): Promise<Map<string, string | null>> {
  const { rows } = await client.query<{
    migration_name: string;
    checksum: string | null;
  }>('SELECT migration_name, checksum FROM public.schema_migrations');
  return new Map(rows.map((row) => [row.migration_name, row.checksum]));
}

/**
 * Fails if an applied migration's file changed. Rows recorded before checksums existed get the
 * current file's checksum (trusted once, checked from then on).
 */
async function verifyApplied(
  client: ClientBase,
  files: MigrationFile[],
  applied: Map<string, string | null>,
): Promise<void> {
  const changed: string[] = [];
  for (const file of files) {
    if (!applied.has(file.name)) continue;
    const recorded = applied.get(file.name);
    if (recorded === null || recorded === undefined) {
      await client.query(
        'UPDATE public.schema_migrations SET checksum = $2 WHERE migration_name = $1',
        [file.name, file.checksum],
      );
    } else if (recorded !== file.checksum) {
      changed.push(file.name);
    }
  }
  if (changed.length > 0) throw new ChangedMigrationError(changed);
}

/** Applies every pending migration in order (or, with `checkOnly`, only verifies the applied ones). */
export async function runMigrations(
  client: ClientBase,
  options: {
    files?: MigrationFile[];
    checkOnly?: boolean;
    log?: (message: string) => void;
  } = {},
): Promise<MigrationResult> {
  const files = options.files ?? readMigrations();
  const log = options.log ?? (() => undefined);
  const result: MigrationResult = { applied: [], skipped: [] };

  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    await ensureTrackingTable(client);
    // Read after taking the lock: a runner that waited sees what the other one applied
    const applied = await appliedChecksums(client);
    await verifyApplied(client, files, applied);
    if (options.checkOnly) {
      result.skipped = files
        .filter((f) => applied.has(f.name))
        .map((f) => f.name);
      return result;
    }

    for (const file of files) {
      if (applied.has(file.name)) {
        result.skipped.push(file.name);
        continue;
      }
      const statements = withoutOwnTransaction(file);
      await client.query('BEGIN');
      try {
        await client.query(statements);
        await client.query(
          'INSERT INTO public.schema_migrations (migration_name, checksum) VALUES ($1, $2)',
          [file.name, file.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${file.name} failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      result.applied.push(file.name);
      log(`applied ${file.name}`);
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'complytude',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD,
  });
  await client.connect();
  try {
    const { applied, skipped } = await runMigrations(client, {
      checkOnly,
      log: (message) => console.log(`  ${message}`),
    });
    console.log(
      checkOnly
        ? `Applied migrations unchanged (${skipped.length} checked)`
        : `Migrations: ${applied.length} applied, ${skipped.length} already applied`,
    );
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
