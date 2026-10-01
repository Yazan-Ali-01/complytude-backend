import type { DatabaseService } from '@lib/database';
import { DatabaseError } from 'pg';
import { TEST_ADMIN_DATABASE } from '../setup/admin-database';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * What the runtime role may do to each table (DB-009): exactly the operations the code performs.
 * A new table or grant changes this map on purpose, next to the migration that makes it.
 */
const PRIVILEGES: Record<string, string> = {
  addon_entitlements: 'SELECT',
  addons: 'SELECT,UPDATE',
  aggregated_usage: 'DELETE,INSERT,SELECT,UPDATE',
  analysis_finding_feedback: 'INSERT,SELECT,UPDATE',
  analysis_jobs: 'INSERT,SELECT,UPDATE',
  audit_logs: 'INSERT,SELECT',
  authorities: 'DELETE,INSERT,SELECT,UPDATE',
  categories: 'INSERT,SELECT,UPDATE',
  credit_ledger: 'INSERT,SELECT',
  credit_packages: 'INSERT,SELECT,UPDATE',
  documents: 'INSERT,SELECT,UPDATE',
  domain_events: 'INSERT,SELECT',
  email_verifications: 'DELETE,INSERT,SELECT,UPDATE',
  entitlement_snapshots: 'DELETE,INSERT,SELECT,UPDATE',
  features: 'INSERT,SELECT,UPDATE',
  generation_jobs: 'DELETE,INSERT,SELECT,UPDATE',
  invitations: 'DELETE,INSERT,SELECT,UPDATE',
  password_resets: 'DELETE,INSERT,SELECT,UPDATE',
  plan_entitlements: 'DELETE,INSERT,SELECT,UPDATE',
  plans: 'INSERT,SELECT,UPDATE',
  platform_permissions: 'DELETE,INSERT,SELECT,UPDATE',
  platform_role_permissions: 'DELETE,INSERT,SELECT',
  platform_roles: 'INSERT,SELECT,UPDATE',
  ruleset_chunks: 'DELETE,INSERT,SELECT',
  ruleset_versions: 'INSERT,SELECT,UPDATE',
  rulesets: 'INSERT,SELECT,UPDATE',
  schema_migrations: '',
  stripe_webhook_events: 'INSERT,SELECT,UPDATE',
  template_rulesets: 'DELETE,INSERT,SELECT',
  template_version_ruleset_versions: 'SELECT',
  template_versions: 'INSERT,SELECT,UPDATE',
  templates: 'DELETE,INSERT,SELECT,UPDATE',
  tenant_addons: 'INSERT,SELECT,UPDATE',
  tenant_ai_consents: 'INSERT,SELECT',
  tenant_overrides: 'INSERT,SELECT,UPDATE',
  tenant_permissions: 'DELETE,INSERT,SELECT,UPDATE',
  tenant_role_permissions: 'DELETE,INSERT,SELECT',
  tenant_roles: 'INSERT,SELECT,UPDATE',
  tenant_subscriptions: 'INSERT,SELECT,UPDATE',
  tenants: 'INSERT,SELECT,UPDATE',
  usage_allocations: 'INSERT,SELECT',
  // Plus UPDATE (projected_at, voided_at) only: projection and refunds
  usage_ledger: 'INSERT,SELECT',
  user_tenants: 'DELETE,INSERT,SELECT,UPDATE',
  users: 'INSERT,SELECT,UPDATE',
};

describe('The runtime database role has only the privileges the code uses', () => {
  let app: TestApp;
  let admin: DatabaseService;

  beforeAll(async () => {
    app = await createTestApp();
    admin = app.module.get<DatabaseService>(TEST_ADMIN_DATABASE);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** The error a statement run as the app's own login (app_login) fails with, if any. */
  async function asApp(sql: string): Promise<string | null> {
    try {
      await app.appDatabaseService.query(sql);
      return null;
    } catch (error) {
      if (error instanceof DatabaseError) return error.code ?? error.message;
      throw error;
    }
  }

  it('may not create objects in public', async () => {
    const { rows } = await admin.query<{ create: boolean }>(
      `SELECT has_schema_privilege('app_user', 'public', 'CREATE') AS create`,
    );
    expect(rows[0].create).toBe(false);
    expect(await asApp('CREATE TABLE public.not_allowed (id int)')).toBe(
      '42501',
    );
  });

  it('has exactly the pinned privileges on every table', async () => {
    const { rows } = await admin.query<{ table: string; privileges: string }>(
      `SELECT t.tablename AS table,
              COALESCE(string_agg(g.privilege_type, ',' ORDER BY g.privilege_type), '') AS privileges
       FROM pg_tables t
       LEFT JOIN information_schema.role_table_grants g
         ON g.table_schema = t.schemaname AND g.table_name = t.tablename AND g.grantee = 'app_user'
       WHERE t.schemaname = 'public'
       GROUP BY t.tablename
       ORDER BY t.tablename`,
    );

    expect(
      Object.fromEntries(rows.map((r) => [r.table, r.privileges])),
    ).toEqual(PRIVILEGES);
    const { rows: columns } = await admin.query<{ grant: string }>(
      `SELECT table_name || '.' || column_name || ':' || privilege_type AS grant
       FROM information_schema.column_privileges
       WHERE grantee = 'app_user' AND table_schema = 'public'
         AND privilege_type <> 'SELECT'
         AND (table_name, privilege_type) NOT IN (
           SELECT table_name, privilege_type FROM information_schema.role_table_grants
           WHERE grantee = 'app_user' AND table_schema = 'public')
       ORDER BY 1`,
    );
    expect(columns.map((c) => c.grant)).toEqual([
      'usage_ledger.projected_at:UPDATE',
      'usage_ledger.voided_at:UPDATE',
    ]);
  });

  it('app_platform holds only the audit retention privileges, beyond what it inherits from app_user', async () => {
    const { rows } = await admin.query<{ grant: string }>(
      `SELECT table_name || ':' || privilege_type AS grant
       FROM information_schema.role_table_grants
       WHERE grantee = 'app_platform' AND table_schema = 'public'
       UNION
       SELECT table_name || '.' || column_name || ':' || privilege_type
       FROM information_schema.column_privileges
       WHERE grantee = 'app_platform' AND table_schema = 'public'
         AND (table_name, privilege_type) NOT IN (
           SELECT table_name, privilege_type FROM information_schema.role_table_grants
           WHERE grantee = 'app_platform' AND table_schema = 'public')
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.grant)).toEqual([
      'audit_logs.ip_address:UPDATE',
      'audit_logs.user_agent:UPDATE',
      'audit_logs:DELETE',
    ]);
  });

  it('is refused a catalog write no code path makes', async () => {
    // WHERE false: the privilege check fails before any row is considered
    expect(await asApp('DELETE FROM public.plans WHERE false')).toBe('42501');
    expect(
      await asApp(
        'UPDATE public.addon_entitlements SET value_int = value_int WHERE false',
      ),
    ).toBe('42501');
    expect(
      await asApp(
        'INSERT INTO public.addons (key, name) SELECT 1, 1 WHERE false',
      ),
    ).toBe('42501');
    // …while the writes the app makes still work
    expect(
      await asApp('UPDATE public.plans SET name = name WHERE false'),
    ).toBeNull();
  });
});
