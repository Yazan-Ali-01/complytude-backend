import {
  BaseRepository,
  CursorPaginationHelper,
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { User } from 'src/modules/users/entities/user.entity';
import {
  CreatePasswordResetInput,
  PasswordReset,
} from './interfaces/user.interfaces';

/**
 * Type for creating a new user row in the database.
 */
export type CreateUserRow = {
  // id: string;
  email: string;
  password_hash: string;
  first_name?: string | null;
  last_name?: string | null;
  is_verified?: boolean;
  platform_role_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing user row in the database.
 */
export type UpdateUserRow = {
  email?: string;
  password_hash?: string;
  first_name?: string | null;
  last_name?: string | null;
  is_verified?: boolean;
  platform_role_key?: string | null;
  updated_at?: Date;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  platform_role_key: string | null;
  created_at: Date;
  updated_at: Date;
};

type PasswordResetRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
};

/**
 * Repository for managing User entities.
 * Handles user authentication, profile management, and password resets.
 */
@Injectable()
export class UserRepository extends BaseRepository<
  User,
  CreateUserRow,
  UpdateUserRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.users');
  }

  /**
   * Find users with cursor-based pagination.
   * Supports filtering by email, is_verified, and platform_role_key.
   *
   * @param filters - Optional filters for email, is_verified, and platform_role_key
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: {
      email?: string;
      is_verified?: boolean;
      platform_role_key?: string | null;
    } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<User>> {
    // Validate and normalize cursor options
    const paginationOpts =
      CursorPaginationHelper.validateOptions(cursorOptions);
    const { cursor, limit, direction } = paginationOpts;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.email) {
      params.push(filters.email);
      conditions.push(`email ILIKE $${params.length}`);
    }
    if (filters.is_verified !== undefined) {
      params.push(filters.is_verified);
      conditions.push(`is_verified = $${params.length}`);
    }
    if (filters.platform_role_key !== undefined) {
      params.push(filters.platform_role_key);
      conditions.push(
        `platform_role_key IS NOT DISTINCT FROM $${params.length}`,
      );
    }

    // Add cursor condition using helper
    const cursorQuery = CursorPaginationHelper.buildCursorQuery(
      direction,
      cursor,
      params.length + 1,
    );

    if (cursorQuery.clause) {
      conditions.push(cursorQuery.clause);
      params.push(...cursorQuery.params);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitClause = CursorPaginationHelper.buildLimitClause(
      limit,
      params.length + 1,
    );
    params.push(...limitClause.params);

    const query =
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ${cursorQuery.orderClause} ${limitClause.clause}`.trim();
    const result = await this.executeQuery<UserRow>(query, params, options);

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Find all verified users.
   * Uses cursor pagination internally but returns only the first 1000 rows (if more exist, they are NOT returned).
   *
   * @note This method does NOT fetch more than 1000 verified users.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @returns Array of verified users
   */
  async findActive(options?: QueryOptions): Promise<User[]> {
    const result = await this.findMany(
      { is_verified: true },
      { limit: 1000 },
      options,
    );
    return result.data;
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, email, password_hash, first_name, last_name, is_verified, platform_role_key, created_at, updated_at';
  }

  /**
   * Map a database row to a User domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped User entity
   */
  protected mapRow(row: Record<string, unknown>): User {
    const data = row as UserRow;
    return {
      id: data.id,
      email: data.email,
      password_hash: data.password_hash,
      first_name: data.first_name,
      last_name: data.last_name,
      is_verified: data.is_verified,
      platform_role_key: data.platform_role_key,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Create a password reset record.
   *
   * @param input - Password reset data
   * @param options - Query options
   */
  async createPasswordReset(
    input: CreatePasswordResetInput,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `INSERT INTO public.password_resets (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [input.userId, input.token, input.expiresAt],
      options,
    );
  }

  /**
   * Find a valid, unexpired, and unused password reset token.
   *
   * @param token - The reset token
   * @param options - Query options
   * @returns PasswordReset object or null
   */
  async findPasswordResetByToken(
    token: string,
    options?: QueryOptions,
  ): Promise<PasswordReset | null> {
    const result = await this.executeQuery<PasswordResetRow>(
      `SELECT id, user_id, token, expires_at, used_at FROM public.password_resets
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
    };
  }

  /**
   * Mark a password reset token as used.
   *
   * @param resetId - The ID of the reset record
   * @param options - Query options
   */
  async markPasswordResetUsed(
    resetId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      'UPDATE public.password_resets SET used_at = NOW() WHERE id = $1',
      [resetId],
      options,
    );
  }
}
