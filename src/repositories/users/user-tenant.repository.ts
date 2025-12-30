import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  LinkUserTenantInput,
  UserTenantInfo,
  UserTenantWithUser,
} from './interfaces/user-tenant.intefaces';
import { UserTenant } from 'src/modules/users/entities/user-tenant.entity';

type UserTenantRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  joined_at: Date;
  updated_at: Date;
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
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      role: data.role,
      is_active: data.is_active,
      joined_at: data.joined_at,
      updated_at: data.updated_at,
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
  ): Promise<UserTenantInfo[]> {
    const result = await this.executeQuery<UserTenantInfo>(
      `SELECT ut.user_id, ut.tenant_id, ut.role, ut.is_active, ut.joined_at, ut.updated_at, t.schema_name
       FROM public.user_tenants ut
       JOIN public.tenants t ON ut.tenant_id = t.tenant_id
       WHERE ut.user_id = $1 AND ut.is_active = true
       ORDER BY ut.joined_at DESC`,
      [userId],
      options,
    );

    return result.rows;
  }

  async getUserInTenant(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<UserTenantWithUser | null> {
    const result = await this.executeQuery<UserTenantWithUser>(
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
