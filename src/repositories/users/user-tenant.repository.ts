import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  UserTenant,
  LinkUserTenantInput,
  UserTenantInfo,
} from './interfaces/user-tenant.intefaces';

type UserTenantRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  joined_at: Date;
  updated_at: Date | null;
  schema_name: string;
};

type UserTenantWithUserRow = UserTenantRow & {
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  is_system_admin: boolean;
};

@Injectable()
export class UserTenantRepository extends BaseRepository<
  UserTenant,
  never,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.user_tenants');
  }

  // BaseRepository requires a mapper even though we only expose custom queries.
  protected mapRow(row: Record<string, unknown>): UserTenant {
    const data = row as UserTenantRow;
    return {
      userId: data.user_id,
      tenantId: data.tenant_id,
      role: data.role,
      isActive: data.is_active,
      joinedAt: data.joined_at,
      updatedAt: data.updated_at,
      schemaName: data.schema_name,
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

    return result.rows.map((row) => ({
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      isActive: row.is_active,
      joinedAt: row.joined_at,
      updatedAt: row.updated_at,
      schemaName: row.schema_name,
    }));
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

    return result.rows.map((row) => ({
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      isActive: row.is_active,
      joinedAt: row.joined_at,
      updatedAt: row.updated_at,
      schemaName: row.schema_name,
    }));
  }

  async getUserInTenant(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<UserTenantInfo | null> {
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
    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      isActive: row.is_active,
      joinedAt: row.joined_at,
      updatedAt: row.updated_at,
      schemaName: row.schema_name,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      isVerified: row.is_verified,
      isSystemAdmin: row.is_system_admin,
    };
  }
}
