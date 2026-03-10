import { PoolClient } from 'pg';

/**
 * RLS-aware tenant context used for tenant-specific schema queries.
 */
export interface TenantContext {
  tenantId: string;
  schema: string;
}

/**
 * Pagination direction for cursor-based pagination.
 */
export type PaginationDirection = 'forward' | 'backward';

/**
 * Options for cursor-based pagination queries.
 */
export interface CursorPaginationOptions {
  cursor?: string | null;
  limit?: number;
  direction?: PaginationDirection;
}

/**
 * Response structure for cursor-based pagination.
 * Includes navigation cursors and flags for bidirectional pagination.
 */
export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Options for offset-based pagination queries.
 */
export interface OffsetPaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response structure for offset-based pagination.
 * Includes total count and page navigation metadata.
 */
export interface OffsetPaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Options that control how queries are executed.
 * - client: existing PoolClient for transactional flow.
 * - tenant: tenant context to set search_path and RLS variables.
 * - isAuthflow: toggle app.is_auth_flow flag for auth flow operations.
 */
export interface QueryOptions {
  client?: PoolClient;
  tenant?: TenantContext;
  isAuthflow?: boolean;
}

/**
 * Options extending QueryOptions for queries requiring a specific client.
 */
export interface ClientQueryOptions extends QueryOptions {
  client: PoolClient;
}
/**
 * Options for finding a single entity.
 *
 * @template TEntity - The entity type for filter typing
 */
export interface FindOneOptions<TEntity = Record<string, unknown>>
  extends QueryOptions {
  filters?: Partial<TEntity>;
  select?: (keyof TEntity)[];
  isAuthflow?: boolean;
}

/**
 * Contract that concrete repositories must fulfill.
 */
export interface RepositoryInterface<
  TEntity,
  TCreate = Partial<TEntity>,
  TUpdate = Partial<TEntity>,
> {
  findById(id: string, options?: QueryOptions): Promise<TEntity | null>;

  findOne(
    filters: Record<string, unknown>,
    options?: QueryOptions,
  ): Promise<TEntity | null>;

  create(data: TCreate, options?: QueryOptions): Promise<TEntity>;

  update(id: string, data: TUpdate, options?: QueryOptions): Promise<TEntity>;

  delete(id: string, options?: QueryOptions): Promise<number>;
}
