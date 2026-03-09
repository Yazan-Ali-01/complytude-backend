import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.constants';

/**
 * DatabaseService
 *
 * Core database service providing connection pooling, query execution, and RLS (Row-Level Security) support.
 *
 * RLS Pattern for Tenant Isolation:
 * ================================
 * All RLS-protected tables MUST use transactions with the appropriate context:
 *
 * Tenant operations:
 * ```typescript
 * await this.databaseService.transactionWithTenantContext({ tenantId }, async (client) => {
 *   const addons = await this.tenantAddonsRepository.findActiveByTenant(tenantId, { client });
 *   return { addons };
 * });
 * ```
 *
 * System / webhook operations (cross-tenant access):
 * ```typescript
 * await this.databaseService.transactionWithPlatformAdminContext(async (client) => {
 *   const sub = await this.subscriptionsRepository.findByStripeSubscriptionId(id, { client });
 *   return sub;
 * });
 * ```
 *
 * Key Points:
 * - Session context variables are transaction-scoped (cleared on COMMIT/ROLLBACK)
 * - Always pass { client } to repository methods within the transaction
 * - Use transactionWithTenantContext for tenant-scoped operations
 * - Use transactionWithPlatformAdminContext for system/admin/webhook operations
 * - Use transaction() for operations on tables without RLS (catalog tables, RBAC sync)
 * - The bare query() method runs WITHOUT any RLS context — only safe for non-RLS tables
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      this.logger.log('Database connection established successfully');
      client.release();
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle client', err);
    });
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database connection pool closed');
    }
  }

  /**
   * Execute a query with parameters.
   *
   * WARNING: This method runs WITHOUT any RLS context. It is only safe for
   * tables that do not have RLS policies (e.g., catalog tables like plans,
   * features, addons, credit_packages, stripe_webhook_events).
   *
   * For RLS-protected tables, use:
   * - transactionWithTenantContext() for tenant-scoped operations
   * - transactionWithPlatformAdminContext() for system/admin operations
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const client = await this.getClient();
    try {
      const result = await client.query<T>(text, params);
      const duration = Date.now() - start;
      this.logger.debug(`Executed query in ${duration}ms: ${text}`);
      return result;
    } catch (error) {
      this.logger.error('Query error', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a client from the pool for transactions
   * @returns Pool client
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute multiple queries in a transaction.
   *
   * WARNING: This method runs WITHOUT any RLS context. It is only safe for
   * tables that do not have RLS policies (e.g., catalog sync, RBAC sync).
   *
   * For RLS-protected tables, use:
   * - transactionWithTenantContext() for tenant-scoped operations
   * - transactionWithPlatformAdminContext() for system/admin operations
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      this.logger.debug('Transaction committed successfully');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction rolled back', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the underlying pool instance (use with caution)
   * @returns Pool instance
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Execute a query within a specific tenant context with RLS
   * @deprecated Use transactionWithTenantContext for proper RLS context isolation
   */
  async queryWithTenantContext<T extends QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    return this.transactionWithTenantContext(
      { tenantId: tenantId },
      async (client) => {
        return await client.query<T>(text, params);
      },
    );
  }

  /**
   * Execute a transaction within a specific tenant context with RLS
   * @param params Object with tenantId, isTenantAdmin (for update policies), allowCrossTenantRead (for SELECT policy)
   * @param callback Transaction callback
   * @returns Transaction result
   */
  async transactionWithTenantContext<T>(
    params: {
      tenantId: string;
      isTenantAdmin?: boolean;
      allowCrossTenantRead?: boolean;
    },
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      await this.setTenantContext(params, client);
      const result = await callback(client);
      await client.query('COMMIT');
      this.logger.debug(`Transaction committed for tenant ${params?.tenantId}`);
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        `Transaction rolled back in tenant context (${params?.tenantId})`,
        error,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  private async setTenantContext(
    params: {
      tenantId: string;
      isTenantAdmin?: boolean;
      allowCrossTenantRead?: boolean;
    },
    client: PoolClient,
  ): Promise<void> {
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      params?.tenantId,
    ]);
    if (params?.isTenantAdmin) {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.is_tenant_admin',
        'true',
      ]);
    }
    if (params?.allowCrossTenantRead) {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.allow_cross_tenant_read',
        'true',
      ]);
    }
    this.logger.debug(
      `Set tenant context: ${params?.tenantId} (transaction-scoped)`,
    );
  }

  /**
   * Execute a transaction with platform admin context for RLS.
   * Sets app.platform_role to 'true' so is_platform_admin() returns true.
   */
  async transactionWithPlatformAdminContext<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
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
}
