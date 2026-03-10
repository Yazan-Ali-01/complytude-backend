import { DatabaseService } from '@lib/database';

/**
 * Tables populated by sync services on app boot. Must not be truncated in beforeEach
 * or factories that depend on plans, roles, permissions will fail.
 */
const REFERENCE_TABLES = [
  'plans',
  'features',
  'plan_entitlements',
  'tenant_roles',
  'tenant_permissions',
  'tenant_role_permissions',
  'platform_roles',
  'platform_permissions',
  'platform_role_permissions',
] as const;

export interface TruncateOptions {
  excludeTables?: string[];
}

let cachedAllTables: string[] | null = null;

/**
 * Truncates all transactional tables in the public schema, excluding reference tables
 * populated by sync services. Call in beforeEach to isolate test cases.
 */
export async function truncateAllTables(
  databaseService: DatabaseService,
  options?: TruncateOptions,
): Promise<void> {
  if (!cachedAllTables) {
    const result = await databaseService.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [],
    );
    cachedAllTables = result.rows.map((r) => r.table_name);
  }

  const exclude = new Set<string>([
    ...REFERENCE_TABLES,
    ...(options?.excludeTables ?? []),
  ]);

  const tablesToTruncate = cachedAllTables.filter((name) => !exclude.has(name));

  if (tablesToTruncate.length === 0) {
    return;
  }

  const quoted = tablesToTruncate
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(', ');
  await databaseService.query(`TRUNCATE TABLE ${quoted} CASCADE`, []);
}
