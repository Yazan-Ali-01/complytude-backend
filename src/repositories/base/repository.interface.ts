import { PoolClient } from 'pg';

/**
 * RLS-aware tenant context used for tenant-specific schema queries.
 */
export interface TenantContext {
  tenantId: string;
  schema: string;
}

/**
 * Options that control how queries are executed.
 * - client: existing PoolClient for transactional flow.
 * - tenant: tenant context to set search_path and RLS variables.
 * - bypassRLS: toggle app.bypass_rls flag for cross-tenant reads when allowed.
 */
export interface QueryOptions {
  client?: PoolClient;
  tenant?: TenantContext;
  bypassRLS?: boolean;
}

export interface FindOneOptions<TFilters = Record<string, unknown>>
  extends QueryOptions {
  filters?: TFilters;
}

/**
 * Options for list queries, supporting filters, sorting, and pagination.
 */
export interface FindManyOptions<TFilters = Record<string, unknown>>
  extends QueryOptions {
  filters?: TFilters;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

/**
 * Contract that concrete repositories must fulfill.
 */
export interface RepositoryInterface<
  TEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> {
  /**
   * Fetch entity by primary ID. Returns null when missing.
   *
   * Example: `await repo.findById(userId, { tenant })`
   */
  findById(id: string, options?: QueryOptions): Promise<TEntity | null>;

  /**
   * Fetch the first entity matching provided filters.
   *
   * Example: `await repo.findOneBy({ email })`
   */
  findOne(
    filters: Record<string, unknown>,
    options?: QueryOptions,
  ): Promise<TEntity | null>;

  /**
   * Fetch all entities respecting filters, ordering, and pagination.
   *
   * Example:
   * ```ts
   * await repo.findAll({
   *   filters: { is_active: true },
   *   orderBy: 'created_at',
   *   orderDirection: 'DESC',
   *   limit: 50,
   * });
   * ```
   */
  findAll(options?: FindManyOptions): Promise<TEntity[]>;

  /**
   * Persist a new entity and return the created row.
   *
   * Example: `await repo.create({ email, first_name })`
   */
  create(data: TCreate, options?: QueryOptions): Promise<TEntity>;

  /**
   * Update an entity by ID. Throws when the record is not found.
   *
   * Example: `await repo.update(id, { first_name: 'Jane' })`
   */
  update(id: string, data: TUpdate, options?: QueryOptions): Promise<TEntity>;

  /**
   * Delete an entity by ID. Throws when the record is not found.
   *
   * Example: `await repo.delete(id)`
   */
  delete(id: string, options?: QueryOptions): Promise<void>;
}
