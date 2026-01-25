import { Injectable } from '@nestjs/common';
import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';
import {
  LinkUserTenantInput,
  UserTenantWithUserRow,
} from './interfaces/user-tenant.intefaces';

type UserTenantRow = {
  user_id: string;
  tenant_id: string;
  role: string;
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
  role: string;
  is_active?: boolean;
};

type UserTenantUpdateInput = {
  role?: string;
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
      role: data.role,
      is_active: data.is_active,
      joined_at: data.joined_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'user_id, tenant_id, role, is_active, joined_at, updated_at';
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
   * @returns User-tenant relationship or null if not found
   */
  async findByCompositeKey(
    key: UserTenantCompositeKey,
    options?: QueryOptions,
  ): Promise<UserTenant | null> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE user_id = $1 AND tenant_id = $2
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
   * @returns Updated user-tenant relationship or null if not found
   */
  async updateByCompositeKey(
    key: UserTenantCompositeKey,
    data: UserTenantUpdateInput,
    options?: QueryOptions,
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

    const result = await this.executeQuery<UserTenantRow>(
      `UPDATE ${this.tableName}
       SET ${setClause}, updated_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2
       RETURNING ${this.getSelectColumns()}`,
      [key.userId, key.tenantId, ...values],
      options,
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
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
   * @returns User tenants
   */
  async findMany(
    filters: { user_id?: string; tenant_id?: string; is_active?: boolean },
    options?: QueryOptions,
  ): Promise<{ data: UserTenant[] }> {
    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.user_id) {
      params.push(filters.user_id);
      conditions.push(`user_id = $${params.length}`);
    }
    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      conditions.push(`tenant_id = $${params.length}`);
    }
    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT ${this.getSelectColumns()} 
                   FROM ${this.tableName}
                   ${whereClause} ORDER BY joined_at`.trim();
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
   * @returns Array of active user tenants
   */
  async findActive(options?: QueryOptions): Promise<UserTenant[]> {
    const result = await this.findMany({ is_active: true }, options);
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
        role: input.role,
        is_active: input.isActive ?? true,
      },
      options,
    );
  }

  /**
   * Get user tenants.
   *
   * @param userId - User ID
   * @param options - Query options (tenant context, client, etc.)
   * @returns User tenants
   */
  async getUserTenants(
    userId: string,
    options?: QueryOptions,
  ): Promise<UserTenant[]> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE user_id = $1
       ORDER BY joined_at DESC`,
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
   * @returns User tenants
   */
  async getActiveUserTenants(
    userId: string,
    options?: QueryOptions,
  ): Promise<UserTenant[]> {
    return this.databaseService.transaction<UserTenant[]>(async (client) => {
      return this.executeQuery<UserTenantRow>(
        `SELECT ${this.getSelectColumns()}
       FROM ${this.tableName}
       WHERE user_id = $1 AND is_active = true
       ORDER BY joined_at DESC`,
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
   * @returns User in tenant
   */
  async getUserInTenant(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<UserTenantWithUserRow | null> {
    const result = await this.executeQuery<UserTenantWithUserRow>(
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at,
              u.email, u.first_name, u.last_name, u.is_verified, u.is_system_admin
       FROM ${this.tableName} ut
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
