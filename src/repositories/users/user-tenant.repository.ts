import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  LinkUserTenantInput,
  UserTenantWithUserRow,
} from './interfaces/user-tenant.intefaces';
import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';

type UserTenantRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  joined_at: Date;
  updated_at: Date;
  schema_name: string;
};

@Injectable()
export class UserTenantRepository extends BaseRepository<
  UserTenant,
  never,
  never
> {
  private readonly SORTABLE_FIELDS = ['joined_at', 'updated_at'] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.user_tenants');
  }

  async findMany(
    filters: { user_id?: string; tenant_id?: string; is_active?: boolean },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'joined_at',
    options?: QueryOptions,
  ): Promise<{ data: UserTenant[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

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

    const orderBy = `ORDER BY ${sortBy} DESC`;

    // pagination --------------------------

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at, t.schema_name 
                   FROM ${this.tableName} ut 
                   JOIN public.tenants t ON ut.tenant_id = t.tenant_id 
                   ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<UserTenantRow>(
      query,
      params,
      options,
    );

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ut ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<UserTenant[]> {
    const result = await this.findMany(
      { is_active: true },
      { page: 1, limit: 1000 },
      'joined_at',
      options,
    );
    return result.data;
  }

  // BaseRepository requires a mapper even though we only expose custom queries.
  protected mapRow(row: Record<string, unknown>): UserTenant {
    const data = row as UserTenantRow;
    return {
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      role: data.role,
      is_active: data.is_active,
      joined_at: data.joined_at,
      updated_at: data.updated_at,
      schema_name: data.schema_name,
    };
  }

  async linkUserToTenant(
    input: LinkUserTenantInput,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `INSERT INTO public.user_tenants (user_id, tenant_id, role, is_active)
       VALUES ($1, $2, $3, $4)`,
      [input.userId, input.tenantId, input.role, input.isActive ?? true],
      options,
    );
  }

  async getUserTenants(
    userId: string,
    options?: QueryOptions,
  ): Promise<UserTenant[]> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at, t.schema_name
       FROM public.user_tenants ut
       JOIN public.tenants t ON ut.tenant_id = t.tenant_id
       WHERE ut.user_id = $1
       ORDER BY ut.joined_at DESC`,
      [userId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getActiveUserTenants(
    userId: string,
    options?: QueryOptions,
  ): Promise<UserTenant[]> {
    const result = await this.executeQuery<UserTenantRow>(
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at, t.schema_name
       FROM public.user_tenants ut
       JOIN public.tenants t ON ut.tenant_id = t.tenant_id
       WHERE ut.user_id = $1 AND ut.is_active = true
       ORDER BY ut.joined_at DESC`,
      [userId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async getUserInTenant(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<UserTenantWithUserRow | null> {
    const result = await this.executeQuery<UserTenantWithUserRow>(
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at, t.schema_name,
              u.email, u.first_name, u.last_name, u.is_verified, u.is_system_admin
       FROM public.user_tenants ut
       JOIN public.users u ON ut.user_id = u.id
       JOIN public.tenants t ON ut.tenant_id = t.tenant_id
       WHERE ut.user_id = $1 AND ut.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
      options,
    );

    const row = result.rows[0];

    return row;
  }
}
