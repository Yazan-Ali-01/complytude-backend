import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { ValidationHelper } from '../common/helpers/validation.helper';

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
   * @param bypassRLS Whether to bypass row level security (default: true for templates tables)
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
        await client.query('SELECT set_config($1, $2, true)', [
          'app.bypass_rls',
          'false',
        ]);
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
   * @param bypassRLS Whether to bypass row level security (default: true for templates tables)
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
        await client.query('SELECT set_config($1, $2, true)', [
          'app.bypass_rls',
          'false',
        ]);
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
   * Execute a query within a specific tenant schema with RLS context
   * @param tenantId Tenant identifier for RLS
   * @param schemaName Schema to execute query in
   * @param text SQL query string
   * @param params Query parameters
   * @returns Query result
   */
  async queryWithTenantContext<T extends QueryResultRow = any>(
    tenantId: string,
    schemaName: string,
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    // Validate inputs to prevent SQL injection
    ValidationHelper.validateTenantContext(tenantId, schemaName);

    const client = await this.getClient();
    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenantId,
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        `${schemaName}, public`,
      ]);

      // Execute query
      const result = await client.query<T>(text, params);

      this.logger.debug(
        `Executed query in schema ${schemaName} for tenant ${tenantId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Query error in tenant context (${tenantId}, ${schemaName})`,
        error,
      );
      throw error;
    } finally {
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        'public',
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        '',
      ]);
      client.release();
    }
  }

  /**
   * Execute a transaction within a specific tenant schema with RLS context
   * @param tenantId Tenant identifier for RLS
   * @param schemaName Schema to execute transaction in
   * @param callback Transaction callback
   * @returns Transaction result
   */
  async transactionWithTenantContext<T>(
    tenantId: string,
    schemaName: string,
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    // Validate inputs to prevent SQL injection
    ValidationHelper.validateTenantContext(tenantId, schemaName);

    const client = await this.getClient();
    try {
      await client.query('BEGIN');

      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenantId,
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        `${schemaName}, public`,
      ]);

      // Execute transaction
      const result = await callback(client);

      await client.query('COMMIT');
      this.logger.debug(
        `Transaction committed in schema ${schemaName} for tenant ${tenantId}`,
      );

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        `Transaction rolled back in tenant context (${tenantId}, ${schemaName})`,
        error,
      );
      throw error;
    } finally {
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        'public',
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        '',
      ]);
      client.release();
    }
  }

  /**
   * Get a client configured for a specific tenant
   * Remember to release the client after use!
   * @param tenantId Tenant identifier
   * @param schemaName Schema name
   * @returns Configured pool client
   */
  async getTenantClient(
    tenantId: string,
    schemaName: string,
  ): Promise<PoolClient> {
    // Validate inputs to prevent SQL injection
    ValidationHelper.validateTenantContext(tenantId, schemaName);

    const client = await this.getClient();

    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenantId,
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        `${schemaName}, public`,
      ]);

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
      await client.query('SELECT set_config($1, $2, true)', [
        'search_path',
        'public',
      ]);
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        '',
      ]);
    } finally {
      client.release();
    }
  }
}
