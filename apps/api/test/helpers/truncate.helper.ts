import { DatabaseService } from '@lib/database';

/**
 * Tables populated by sync services on app boot. Must not be truncated in beforeEach
 * or factories that depend on plans, roles, permissions will fail.
 * schema_migrations records which migrations the worker database already has.
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
  'schema_migrations',
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

  // CASCADE also empties tenant_roles (FK tenant_id -> tenants) and, through it,
  // tenant_role_permissions, although both are excluded above. Keep the system roles
  // (tenant_id IS NULL, synced on app start) and put them back; tenant custom roles go.
  await databaseService.transaction(async (client) => {
    await client.query(
      `CREATE TEMP TABLE keep_tenant_roles ON COMMIT DROP AS
       SELECT * FROM public.tenant_roles WHERE tenant_id IS NULL`,
    );
    await client.query(
      `CREATE TEMP TABLE keep_tenant_role_permissions ON COMMIT DROP AS
       SELECT rp.* FROM public.tenant_role_permissions rp
       JOIN public.tenant_roles r ON r.id = rp.role_id
       WHERE r.tenant_id IS NULL`,
    );
    await client.query(`TRUNCATE TABLE ${quoted} CASCADE`);
    await client.query(
      'INSERT INTO public.tenant_roles SELECT * FROM keep_tenant_roles ON CONFLICT DO NOTHING',
    );
    await client.query(
      'INSERT INTO public.tenant_role_permissions SELECT * FROM keep_tenant_role_permissions ON CONFLICT DO NOTHING',
    );
  });
}
