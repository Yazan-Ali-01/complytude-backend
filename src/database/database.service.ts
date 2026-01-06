import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

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
        await client.query("SET LOCAL app.bypass_rls = 'true'");
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
        await client.query('RESET app.bypass_rls');
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
    bypassRLS: boolean = true,
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      if (bypassRLS) {
        await client.query("SET LOCAL app.bypass_rls = 'true'");
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
        await client.query('RESET app.bypass_rls');
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
   * @param tenantId Tenant identifier for RLS
   * @param text SQL query string
   * @param params Query parameters
   * @returns Query result
   */
  async queryWithTenantContext<T extends QueryResultRow = any>(
    tenantId: string,
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const client = await this.getClient();
    try {
      // Set tenant context for RLS
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);

      // Execute query
      const result = await client.query<T>(text, params);

      this.logger.debug(`Executed query for tenant ${tenantId}`);

      return result;
    } catch (error) {
      this.logger.error(`Query error in tenant context (${tenantId})`, error);
      throw error;
    } finally {
      // Reset tenant context
      await client.query('RESET app.current_tenant_id');
      client.release();
    }
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

      // Set tenant context for RLS
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);

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
      // Reset tenant context
      await client.query('RESET app.current_tenant_id');
      client.release();
    }
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
  async releaseTenantClient(client: PoolClient): Promise<void> {
    try {
      await client.query('RESET app.current_tenant_id');
    } finally {
      client.release();
    }
  }
}
