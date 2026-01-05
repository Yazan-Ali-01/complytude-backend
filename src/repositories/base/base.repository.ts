import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service';
import {
  FindOneOptions,
  QueryOptions,
  ClientQueryOptions,
  RepositoryInterface,
} from './repository.interface';

/**
 * Abstract base repository providing common CRUD operations and query execution.
 * Handles database connections, transaction contexts, and row mapping.
 *
 * @template TEntity - The entity type this repository manages
 * @template TCreate - The input type for creating entities (defaults to Partial<TEntity>)
 * @template TUpdate - The input type for updating entities (defaults to Partial<TEntity>)
 */
@Injectable()
export abstract class BaseRepository<
  TEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> implements RepositoryInterface<TEntity, TCreate, TUpdate>
{
  protected readonly logger = new Logger(BaseRepository.name);

  constructor(
    protected readonly databaseService: DatabaseService,
    protected readonly tableName: string,
  ) {}

  /**
   * Convert a raw DB row into the concrete entity type.
   * Implemented by child repositories to keep mapping logic close to the model.
   */
  protected abstract mapRow(row: Record<string, unknown>): TEntity;

  /**
   * Get the list of columns to select in queries.
   * Override this in child repositories to specify explicit columns.
   * Default returns all columns (*).
   */
  protected abstract getSelectColumns(): string;

  /**
   * Execute a query respecting transaction clients, tenant context, and RLS.
   * Falls back to DatabaseService for non-transactional access.
   *
   * The `bypassRLS` option allows selectively bypassing Row-Level Security (RLS) enforcement.
   * This is essential for privileged operations (such as system admin actions, migrations, cross-tenant management,
   * or internal maintenance queries) which require direct access to all rows, regardless of RLS policies.
   * For standard application flows, RLS is enforced by default to maintain data isolation and tenant security.
   *
   * Example (inside service):
   * ```ts
   * await this.executeQuery('UPDATE users SET last_login = NOW() WHERE id = $1', [userId], { client });
   * ```
   */
  protected async executeQuery<T extends QueryResultRow = QueryResultRow>(
    query: string,
    params: unknown[] = [],
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    this.logger.debug(
      `executeQuery: table=${this.tableName}, client=${
        options?.client ? 'yes' : 'no'
      }, tenant=${options?.tenant?.tenantId ?? 'none'}, bypassRLS=${
        options?.bypassRLS ?? true
      }, sql=${query}, params=${JSON.stringify(params)}`,
    );
    const { client, tenant, bypassRLS = true } = options ?? {};
    if (client) {
      return this.runWithClient<T>(query, params, {
        client,
        tenant,
        bypassRLS,
      });
    }

    if (tenant) {
      return this.databaseService.queryWithTenantContext<T>(
        tenant.tenantId,
        tenant.schema,
        query,
        params,
      );
    }

    return this.databaseService.query<T>(query, params, bypassRLS);
  }

  /**
   * Execute a query using a provided PoolClient, optionally setting tenant context
   * or bypassing RLS. Resets session settings after the query completes.
   *
   * - When `tenant` is provided, sets `app.current_tenant_id` and search_path.
   * - When `bypassRLS` is true, toggles `app.bypass_rls`.
   *
   * Example:
   * ```ts
   * await this.runWithClient(client, 'SELECT * FROM docs', [], { tenantId, schema: 'tenant_acme' });
   * ```
   */
  private async runWithClient<T extends QueryResultRow = QueryResultRow>(
    query: string,
    params: unknown[],
    options: ClientQueryOptions,
  ): Promise<QueryResult<T>> {
    const { client, tenant, bypassRLS = true } = options;
    const hasTenant = !!tenant;
    this.logger.debug(
      `runWithClient: table=${this.tableName}, tenant=${
        tenant?.tenantId ?? 'none'
      }, bypassRLS=${bypassRLS}, params=${JSON.stringify(params)}`,
    );

    try {
      if (hasTenant) {
        await client.query(
          `SET LOCAL app.current_tenant_id = '${tenant.tenantId}'`,
        );
        await client.query(`SET search_path TO ${tenant.schema}, public`);
      } else if (bypassRLS) {
        await client.query("SET LOCAL app.bypass_rls = 'true'");
      }

      return await client.query<T>(query, params);
    } finally {
      if (hasTenant) {
        await client.query('RESET search_path');
        await client.query('RESET app.current_tenant_id');
      } else if (bypassRLS) {
        await client.query('RESET app.bypass_rls');
      }
    }
  }

  /**
   * Fetch entity by primary ID. Returns null when missing.
   *
   * Example:
   * ```ts
   * const user = await this.findById(userId, { tenant });
   * ```
   */
  async findById(id: string, options?: QueryOptions): Promise<TEntity | null> {
    this.logger.debug(
      `findById: table=${this.tableName}, id=${id}, tenant=${
        options?.tenant?.tenantId ?? 'none'
      }`,
    );
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM ${this.tableName} WHERE id = $1`,
      [id],
      options,
    );

    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  /**
   * Fetch the first record matching the provided filters.
   *
   * Example:
   * ```ts
   * const user = await this.findOneBy({ email });
   * ```
   */
  async findOne(options?: FindOneOptions<TEntity>): Promise<TEntity | null> {
    this.logger.debug(
      `findOne: table=${this.tableName}, filters=${JSON.stringify(
        options?.filters ?? {},
      )}, tenant=${options?.tenant?.tenantId ?? 'none'}`,
    );
    const params: unknown[] = [];
    let whereClause = '';
    if (options?.filters) {
      whereClause = 'WHERE ';
      for (const [key, value] of Object.entries(options.filters)) {
        params.push(value);
        whereClause += `${key} = $${params.length} AND `;
      }
      whereClause = whereClause.slice(0, -5);
    }

    const select = options?.select ? options.select.join(', ') : '*';
    const result = await this.executeQuery(
      `SELECT ${select} FROM ${this.tableName} ${whereClause} LIMIT 1`,
      params,
      options,
    );

    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  /**
   * Insert a new record and return the mapped entity.
   *
   * Example:
   * ```ts
   * const created = await this.create({ email, first_name });
   * ```
   */
  async create(data: TCreate, options?: QueryOptions): Promise<TEntity> {
    const keys = Object.keys(data as Record<string, unknown>);
    const values = Object.values(data as Record<string, unknown>);

    if (keys.length === 0) {
      this.logger.debug(`create: table=${this.tableName} received empty data`);
      throw new Error('No data provided for create');
    }

    this.logger.debug(
      `create: table=${this.tableName}, columns=${keys.join(
        ', ',
      )}, tenant=${options?.tenant?.tenantId ?? 'none'}`,
    );
    const columns = keys.join(', ');
    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.executeQuery(query, values, options);
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Update an existing record by ID; throws NotFoundException when missing.
   *
   * Example:
   * ```ts
   * const updated = await this.update(id, { first_name: 'Jane' });
   * ```
   */
  async update(
    id: string,
    data: TUpdate,
    options?: QueryOptions,
  ): Promise<TEntity> {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    );

    if (entries.length === 0) {
      this.logger.debug(`update: table=${this.tableName} received empty data`);
      throw new Error('No data provided for update');
    }

    this.logger.debug(
      `update: table=${this.tableName}, id=${id}, fields=${entries
        .map(([key]) => key)
        .join(', ')}, tenant=${options?.tenant?.tenantId ?? 'none'}`,
    );
    const setClause = entries
      .map(([key], idx) => `${key} = $${idx + 2}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, [id, ...values], options);
    if (result.rows.length === 0) {
      throw new NotFoundException(
        `Record with ID ${id} not found in ${this.tableName}`,
      );
    }

    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Delete a record by ID; throws NotFoundException when missing.
   *
   * Example:
   * ```ts
   * await this.delete(id);
   * ```
   */
  async delete(id: string, options?: QueryOptions): Promise<void> {
    this.logger.debug(
      `delete: table=${this.tableName}, id=${id}, tenant=${
        options?.tenant?.tenantId ?? 'none'
      }`,
    );
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id],
      options,
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(
        `Record with ID ${id} not found in ${this.tableName}`,
      );
    }
  }
}
