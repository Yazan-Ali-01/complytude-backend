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
 * All RLS-protected tables MUST use transactions with tenant context:
 *
 * Usage Pattern:
 * ```typescript
 * await this.databaseService.transactionWithTenantContext(tenantId, async (client) => {
 *   const addons = await this.tenantAddonsRepository.findActiveByTenant(tenantId, { client });
 *   const overrides = await this.tenantOverridesRepository.findActiveByTenant(tenantId, { client });
 *   return { addons, overrides };
 * });
 * ```
 *
 * Key Points:
 * - SET LOCAL app.current_tenant_id is transaction-scoped (clears on COMMIT/ROLLBACK)
 * - Always pass { client } to repository methods within the transaction
 * - Never use queryWithTenantContext for single queries - wrap in transaction instead
 * - System operations (e.g., sync services) should use transaction(callback, true) to bypass RLS
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
   * Execute a query with parameters
   * @param text SQL query string
   * @param params Query parameters
   * @param bypassRLS Whether to bypass row level security (default: true)
   * @returns Query result
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    bypassRLS: boolean = true,
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const client = await this.getClient();
    try {
      if (bypassRLS) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.bypass_rls',
          'true',
        ]);
      }
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
   * Execute multiple queries in a transaction
   * @param callback Transaction callback
   * @param bypassRLS Whether to bypass row level security (default: false)
   * @returns Transaction result
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    bypassRLS: boolean = false,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      if (bypassRLS) {
        await client.query('SELECT set_config($1, $2, true)', [
          'app.bypass_rls',
          'true',
        ]);
      }
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
   * Get a client configured for a specific tenant (RLS context only)
   * Remember to release the client after use!
   */
  async getTenantClient(tenantId: string): Promise<PoolClient> {
    const client = await this.getClient();

    try {
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);
      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Release a tenant client and reset its context
   */
  releaseTenantClient(client: PoolClient): void {
    client.release();
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
