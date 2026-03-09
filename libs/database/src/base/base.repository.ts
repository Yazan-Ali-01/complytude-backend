import { Injectable, Logger } from '@nestjs/common';
import { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database.service';
import {
  ClientQueryOptions,
  FindOneOptions,
  QueryOptions,
  RepositoryInterface,
} from './repository.interface';

/**
 * Abstract base repository providing common CRUD operations and query execution.
 * Handles database connections, transaction contexts, and row mapping.
 *
 * @template TEntity - The entity type this repository manages (returned from queries)
 * @template TCreate - The input type for creating entities. Should use CreateXRow types
 *                     with JSON/JSONB fields as strings (already stringified by services)
 * @template TUpdate - The input type for updating entities. Should use UpdateXRow types
 *                     with optional JSON/JSONB fields as strings (already stringified by services)
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

  protected abstract mapRow(row: Record<string, unknown>): TEntity;

  protected abstract getSelectColumns(): string;

  protected async executeQuery<T extends QueryResultRow = QueryResultRow>(
    query: string,
    params: unknown[] = [],
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    this.logger.debug(
      `executeQuery: table=${this.tableName}, client=${
        options?.client ? 'yes' : 'no'
      }, tenant=${options?.tenant?.tenantId ?? 'none'}, ${options?.isAuthflow ? 'isAuthflow=true' : ''}, sql=${query}, params=${JSON.stringify(params)}`,
    );
    const { client, tenant, isAuthflow = false } = options ?? {};
    if (client) {
      return this.runWithClient<T>(query, params, {
        client,
        tenant,
        isAuthflow,
      });
    }

    if (tenant) {
      return this.databaseService.transactionWithTenantContext(
        { tenantId: tenant.tenantId },
        async (txClient) => {
          return await txClient.query<T>(query, params);
        },
      );
    }

    if (isAuthflow) {
      return this.databaseService.transaction(async (txClient) => {
        await txClient.query("SET LOCAL app.is_auth_flow = 'true'");
        return await txClient.query<T>(query, params);
      });
    }

    return this.databaseService.query<T>(query, params);
  }

  private async runWithClient<T extends QueryResultRow = QueryResultRow>(
    query: string,
    params: unknown[],
    options: ClientQueryOptions,
  ): Promise<QueryResult<T>> {
    const { client, tenant, isAuthflow = false } = options;

    this.logger.debug(
      `runWithClient: table=${this.tableName}, tenant=${
        tenant?.tenantId ?? 'none'
      }, ${isAuthflow ? 'isAuthflow=true' : ''}, params=${JSON.stringify(params)}`,
    );

    try {
      if (isAuthflow) {
        await client.query("SET LOCAL app.is_auth_flow = 'true'");
      }

      return await client.query<T>(query, params);
    } catch (error) {
      this.logger.error(`Error executing query: ${error}`);
      throw error;
    }
  }

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
      throw new Error(`Record with ID ${id} not found in ${this.tableName}`);
    }

    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  async delete(id: string, options?: QueryOptions): Promise<number> {
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

    return result.rowCount ?? 0;
  }
}
