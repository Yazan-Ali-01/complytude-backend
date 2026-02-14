import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * DatabaseService
 *
 * Core database service providing connection pooling, query execution, and RLS (Row-Level Security) support.
 *
 * RLS Pattern for Tenant Isolation:
 * ================================
 * All RLS-protected tables MUST use transactions with tenant context:
 *
 * RLS-Protected Tables:
 * - tenant_subscriptions
 * - tenant_addons
 * - tenant_overrides
 * - usage_ledger
 * - credit_ledger
 * - aggregated_usage
 * - entitlement_snapshots
 * - domain_events (tenant_id can be NULL for system events)
 *
 * Usage Pattern:
 * ```typescript
 * // In service layer
 * await this.databaseService.transactionWithTenantContext(tenantId, async (client) => {
 *   // All queries here automatically have tenant context set
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
  private pool: Pool;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.pool = new Pool({
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      database: this.configService.get<string>('database.name'),
      user: this.configService.get<string>('database.user'),
      password: this.configService.get<string>('database.password'),
      max: this.configService.get<number>('database.maxConnections'),
      idleTimeoutMillis: this.configService.get<number>(
        'database.idleTimeoutMillis',
      ),
      connectionTimeoutMillis: this.configService.get<number>(
        'database.connectionTimeoutMillis',
      ),
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      this.logger.log('✅ Database connection established successfully');
      client.release();
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }

    // Handle pool errors
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
      if (bypassRLS) {
        // await client.query('RESET app.bypass_rls');
      }
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
   * @param bypassRLS Whether to bypass row level security (default: true)
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
      if (bypassRLS) {
        // await client.query('RESET app.bypass_rls');
      }
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
   * WARNING: This method is deprecated. Use transactionWithTenantContext instead.
   * Single queries with RLS should be wrapped in a transaction to ensure proper context isolation.
   *
   * @param tenantId Tenant identifier for RLS
   * @param text SQL query string
   * @param params Query parameters
   * @returns Query result
   * @deprecated Use transactionWithTenantContext for proper RLS context isolation
   */
  async queryWithTenantContext<T extends QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    // Wrap in transaction to ensure proper RLS context
    return this.transactionWithTenantContext(tenantId, async (client) => {
      return await client.query<T>(text, params);
    });
  }

  /**
   * Execute a transaction within a specific tenant context with RLS
   * @param tenantId Tenant identifier for RLS
   * @param callback Transaction callback
   * @returns Transaction result
   */
  async transactionWithTenantContext<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      // Set tenant context for RLS (transaction-scoped)
      await this.setTenantContext(client, tenantId);

      // Execute transaction
      const result = await callback(client);

      await client.query('COMMIT');
      this.logger.debug(`Transaction committed for tenant ${tenantId}`);

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        `Transaction rolled back in tenant context (${tenantId})`,
        error,
      );
      throw error;
    } finally {
      // Tenant context is automatically cleared on transaction end (SET LOCAL)
      client.release();
    }
  }

  /**
   * Set tenant context for RLS within a transaction
   * IMPORTANT: This must be called within an active transaction (after BEGIN)
   * Uses SET LOCAL to ensure the setting is transaction-scoped and clears automatically on COMMIT/ROLLBACK
   *
   * @param client PoolClient with an active transaction
   * @param tenantId Tenant identifier for RLS
   * @private
   */
  private async setTenantContext(
    client: PoolClient,
    tenantId: string,
  ): Promise<void> {
    // SET LOCAL ensures the setting is transaction-scoped
    // It will automatically be cleared when the transaction ends (COMMIT or ROLLBACK)
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
    this.logger.debug(`Set tenant context: ${tenantId} (transaction-scoped)`);
  }

  /**
   * Get a client configured for a specific tenant (RLS context only)
   * Remember to release the client after use!
   * @param tenantId Tenant identifier
   * @returns Configured pool client
   */
  async getTenantClient(tenantId: string): Promise<PoolClient> {
    const client = await this.getClient();

    try {
      // Set tenant context for RLS
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);

      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Release a tenant client and reset its context
   * @param client Pool client to release
   */
  releaseTenantClient(client: PoolClient): void {
    client.release();
  }
}
