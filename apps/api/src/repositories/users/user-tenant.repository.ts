import { BaseRepository, DatabaseService, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';
import {
  LinkUserTenantInput,
  UserTenantWithUserRow,
} from './interfaces/user-tenant.intefaces';

type UserTenantRow = {
  user_id: string;
  tenant_id: string;
  role_key: string;
  role_name: string;
  is_active: boolean;
  joined_at: Date;
  updated_at: Date;
};

type UserTenantCompositeKey = {
  userId: string;
  tenantId: string;
};

type UserTenantCreateInput = {
  user_id: string;
  tenant_id: string;
  role_key: string;
  is_active?: boolean;
};

type UserTenantUpdateInput = {
  role_key?: string;
  is_active?: boolean;
};

/**
 * Repository for managing User-Tenant associations.
 * Handles linking users to tenants and querying membership.
 *
 * Note: This repository uses a composite key (user_id, tenant_id) and overrides
 * all base repository methods to handle this properly.
 */
@Injectable()
export class UserTenantRepository extends BaseRepository<
  UserTenant,
  UserTenantCreateInput,
  UserTenantUpdateInput
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.user_tenants');
  }

  /**
   * Map a database row to a UserTenant domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped UserTenant entity
   */
  protected mapRow(row: Record<string, unknown>): UserTenant {
    const data = row as UserTenantRow;
    return {
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      role_key: data.role_key,
      role_name: data.role_name || '', // Default to empty string if not included
      is_active: data.is_active,
      joined_at: data.joined_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Get the list of columns to select in queries.
   * @param includeRoleName - Whether to include role_name from roles table JOIN
   */
  protected getSelectColumns(includeRoleName: boolean = true): string {
    const baseColumns =
      'ut.user_id, ut.tenant_id, ut.role_key, ut.is_active, ut.joined_at, ut.updated_at';
    if (includeRoleName) {
      return `${baseColumns.replace('ut.role_key', 'ut.role_key, r.name as role_name')}`;
    }
    return baseColumns;
  }

  /**
   * Get the base FROM clause with optional roles JOIN
   * @param includeRoleName - Whether to include roles table JOIN
   */
  protected getFromClause(includeRoleName: boolean = true): string {
    if (includeRoleName) {
      return `${this.tableName} ut
              INNER JOIN public.tenant_roles r ON r.key = ut.role_key
                AND (r.tenant_id = ut.tenant_id OR r.is_system = true)`;
    }
    return `${this.tableName} ut`;
  }

  /**
   * Override: Find by composite key (user_id, tenant_id).
   * Base method expects single ID, but this repository uses composite key.
   *
   * @param _id - Not used (kept for interface compatibility)
   * @param _options - Query options (tenant context, client, etc.)
   * @throws Error - Always throws as single ID lookup is not supported
   */
  findById(_id: string, _options?: QueryOptions): Promise<UserTenant | null> {
    throw new Error(
      'findById is not supported for UserTenantRepository. Use findByCompositeKey instead.',
    );
  }

  /**
   * Find user-tenant relationship by composite key.
   *
   * @param key - Composite key containing userId and tenantId
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns User-tenant relationship or null if not found
   */
  async findByCompositeKey(
    key: UserTenantCompositeKey,
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenant | null> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns(includeRoleName)}
       FROM ${this.getFromClause(includeRoleName)}
       WHERE ut.user_id = $1 AND ut.tenant_id = $2
       LIMIT 1`,
      [key.userId, key.tenantId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Override: Update user-tenant relationship by composite key.
   * Base method expects single ID, but this repository uses composite key.
   *
   * @param _id - Not used (kept for interface compatibility)
   * @param _data - Update data
   * @param _options - Query options
   * @throws Error - Always throws as single ID update is not supported
   */
  update(
    _id: string,
    _data: UserTenantUpdateInput,
    _options?: QueryOptions,
  ): Promise<UserTenant> {
    throw new Error(
      'update is not supported for UserTenantRepository. Use updateByCompositeKey instead.',
    );
  }

  /**
   * Update user-tenant relationship by composite key.
   *
   * @param key - Composite key containing userId and tenantId
   * @param data - Fields to update (role, is_active)
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name in result (default: true)
   * @returns Updated user-tenant relationship or null if not found
   */
  async updateByCompositeKey(
    key: UserTenantCompositeKey,
    data: UserTenantUpdateInput,
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenant | null> {
    const entries = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );

    if (entries.length === 0) {
      throw new Error('No data provided for update');
    }

    const setClause = entries
      .map(([key], idx) => `${key} = $${idx + 3}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    // Update the record first
    const updateResult = await this.executeQuery(
      `UPDATE ${this.tableName}
       SET ${setClause}, updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [key.userId, key.tenantId, ...values],
      options,
    );

    if (updateResult.rowCount === 0) {
      return null;
    }

    // Then fetch with optional role name
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns(includeRoleName)}
       FROM ${this.getFromClause(includeRoleName)}
       WHERE ut.user_id = $1 AND ut.tenant_id = $2`,
      [key.userId, key.tenantId],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Override: Delete user-tenant relationship by composite key.
   * Base method expects single ID, but this repository uses composite key.
   *
   * @param _id - Not used (kept for interface compatibility)
   * @param _options - Query options
   * @throws Error - Always throws as single ID delete is not supported
   */
  delete(_id: string, _options?: QueryOptions): Promise<number> {
    throw new Error(
      'delete is not supported for UserTenantRepository. Use deleteByCompositeKey instead.',
    );
  }

  /**
   * Delete user-tenant relationship by composite key.
   *
   * @param key - Composite key containing userId and tenantId
   * @param options - Query options (tenant context, client, etc.)
   * @returns Number of relationships deleted (0 if not found)
   */
  async deleteByCompositeKey(
    key: UserTenantCompositeKey,
    options?: QueryOptions,
  ): Promise<number> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE user_id = $1 AND tenant_id = $2`,
      [key.userId, key.tenantId],
      options,
    );

    return result.rowCount ?? 0;
  }

  /**
   * Find user tenants, without pagination.
   * Supports filtering by user_id, tenant_id, and is_active.
   *
   * @param filters - Optional filters for user_id, tenant_id, and is_active
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns User tenants
   */
  async findMany(
    filters: { user_id?: string; tenant_id?: string; is_active?: boolean },
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<{ data: UserTenant[] }> {
    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.user_id) {
      params.push(filters.user_id);
      conditions.push(`ut.user_id = $${params.length}`);
    }
    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      conditions.push(`ut.tenant_id = $${params.length}`);
    }
    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`ut.is_active = $${params.length}`);
    }

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT ${this.getSelectColumns(includeRoleName)}
                   FROM ${this.getFromClause(includeRoleName)}
                   ${whereClause} ORDER BY ut.joined_at`.trim();
    const result = await this.executeQuery<UserTenantRow>(
      query,
      params,
      options,
    );

    return {
      data: result.rows.map((row) => this.mapRow(row)),
    };
  }

  /**
   * Find all active user tenants.
   *
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns Array of active user tenants
   */
  async findActive(
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenant[]> {
    const result = await this.findMany(
      { is_active: true },
      options,
      includeRoleName,
    );
    return result.data;
  }

  /**
   * Link a user to a tenant (convenience method).
   * This is a wrapper around the create method for backward compatibility.
   *
   * @param input - Link user tenant input
   * @param options - Query options (tenant context, client, etc.)
   * @returns Created user-tenant relationship
   */
  async linkUserToTenant(
    input: LinkUserTenantInput,
    options?: QueryOptions,
  ): Promise<UserTenant> {
    return this.create(
      {
        user_id: input.userId,
        tenant_id: input.tenantId,
        role_key: input.roleKey,
        is_active: input.isActive ?? true,
      },
      options,
    );
  }

  /**
   * Upsert user-tenant relationship (insert or update if exists).
   * This is useful for accepting invitations where race conditions might occur.
   * Uses INSERT ... ON CONFLICT to handle concurrent requests atomically.
   *
   * @param input - User tenant data
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name in result (default: true)
   * @returns Object containing the user-tenant relationship and whether it was newly created
   */
  async upsertUserTenant(
    input: {
      userId: string;
      tenantId: string;
      roleKey: string;
      isActive?: boolean;
    },
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<{ userTenant: UserTenant; wasCreated: boolean }> {
    const isActive = input.isActive ?? true;

    // First, upsert the record
    const upsertResult = await this.executeQuery<{ was_created: boolean }>(
      `INSERT INTO ${this.tableName} (user_id, tenant_id, role_key, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET
         is_active = EXCLUDED.is_active,
         role_key = EXCLUDED.role_key,
         updated_at = NOW()
       RETURNING (xmax = 0) AS was_created`,
      [input.userId, input.tenantId, input.roleKey, isActive],
      options,
    );

    const wasCreated = upsertResult.rows[0]?.was_created ?? false;

    // Then fetch with optional role name
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns(includeRoleName)}
       FROM ${this.getFromClause(includeRoleName)}
       WHERE ut.user_id = $1 AND ut.tenant_id = $2`,
      [input.userId, input.tenantId],
      options,
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert user-tenant relationship');
    }

    return {
      userTenant: this.mapRow(row),
      wasCreated,
    };
  }

  /**
   * Get user tenants.
   *
   * @param userId - User ID
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns User tenants
   */
  async getUserTenants(
    userId: string,
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenant[]> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns(includeRoleName)}
       FROM ${this.getFromClause(includeRoleName)}
       WHERE ut.user_id = $1
       ORDER BY ut.joined_at DESC`,
      [userId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get all active user tenants.
   *
   * @param userId - User ID
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns User tenants
   */
  async getActiveUserTenants(
    userId: string,
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenant[]> {
    return this.databaseService.transaction<UserTenant[]>(async (client) => {
      return this.executeQuery<UserTenantRow>(
        `SELECT ${this.getSelectColumns(includeRoleName)}
       FROM ${this.getFromClause(includeRoleName)}
       WHERE ut.user_id = $1 AND ut.is_active = true
       ORDER BY ut.joined_at DESC`,
        [userId],
        { client, ...options },
      ).then((result) => result.rows.map((row) => this.mapRow(row)));
    });
  }

  /**
   * Get user in tenant.
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param options - Query options (tenant context, client, etc.)
   * @param includeRoleName - Whether to include role display name (default: true)
   * @returns User in tenant
   */
  async getUserInTenant(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
    includeRoleName: boolean = true,
  ): Promise<UserTenantWithUserRow | null> {
    const roleJoin = includeRoleName
      ? `INNER JOIN public.tenant_roles r ON r.key = ut.role_key
         AND (r.tenant_id = ut.tenant_id OR r.is_system = true)`
      : '';

    const roleColumn = includeRoleName ? ', r.name as role_name' : '';

    const result = await this.executeQuery<UserTenantWithUserRow>(
      `SELECT ut.user_id, ut.tenant_id, ut.role_key${roleColumn}, ut.is_active, ut.joined_at, ut.updated_at,
              u.email, u.first_name, u.last_name, u.is_verified, u.platform_role_key
       FROM ${this.tableName} ut
       ${roleJoin}
       JOIN public.users u ON ut.user_id = u.id
       WHERE ut.user_id = $1 AND ut.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
      options,
    );

    const row = result.rows[0];

    return row || null;
  }
}
