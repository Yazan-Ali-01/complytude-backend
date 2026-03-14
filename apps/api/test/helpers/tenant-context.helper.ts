import { DatabaseService } from '@lib/database';
import { PoolClient } from 'pg';

/**
 * Execute a callback within a tenant RLS context.
 *
 * Uses `SET LOCAL ROLE app_user` so that RLS policies are enforced even when the
 * test pool connects as a superuser. Defaults to non-admin — set isTenantAdmin: true
 * explicitly when testing admin paths.
 */
export async function withTenantContext<T>(
  databaseService: DatabaseService,
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>,
  options?: { isTenantAdmin?: boolean; allowCrossTenantRead?: boolean },
): Promise<T> {
  const client = await databaseService.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_user');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
    await client.query('SELECT set_config($1, $2, true)', [
      'app.is_tenant_admin',
      (options?.isTenantAdmin ?? false).toString(),
    ]);
    await client.query('SELECT set_config($1, $2, true)', [
      'app.allow_cross_tenant_read',
      (options?.allowCrossTenantRead ?? false).toString(),
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a callback within a platform admin RLS context.
 *
 * Uses `SET LOCAL ROLE app_user` so that RLS policies are enforced even when the
 * test pool connects as a superuser. Use for testing platform-scoped queries
 * (global templates, tenant management, etc.).
 */
export async function withPlatformAdminContext<T>(
  databaseService: DatabaseService,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await databaseService.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_user');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.platform_role',
      'true',
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
