import { Injectable, Logger } from '@nestjs/common';
import { PermissionsRepository } from '../repositories/permissions.repository';
import { RolePermissionsRepository } from '../repositories/role-permissions.repository';
import { UserTenantRepository } from '../../../repositories/users/user-tenant.repository';
import { TenantRole } from '../constants/roles.constant';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  private rolePermissionCache = new Map<TenantRole, { perms: Set<string>; expiry: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly rolePermissionsRepository: RolePermissionsRepository,
    private readonly userTenantRepository: UserTenantRepository,
  ) {}

  async getPermissionsForRole(role: TenantRole): Promise<Set<string>> {
    const cached = this.rolePermissionCache.get(role);

    if (cached && cached.expiry > Date.now()) {
      return cached.perms;
    }

    const permissions = await this.rolePermissionsRepository.getPermissionsForRole(role);
    const permSet = new Set(permissions.map((p) => p.name));

    this.rolePermissionCache.set(role, {
      perms: permSet,
      expiry: Date.now() + this.CACHE_TTL_MS,
    });

    return permSet;
  }

  async getUserPermissions(userId: string, tenantId: string): Promise<Set<string>> {
    const userTenant = await this.userTenantRepository.findByCompositeKey({ userId, tenantId });

    if (!userTenant?.role) {
      return new Set();
    }

    return this.getPermissionsForRole(userTenant.role as TenantRole);
  }

  async hasPermission(
    userId: string,
    tenantId: string,
    permission: string,
  ): Promise<boolean> {
    const perms = await this.getUserPermissions(userId, tenantId);
    return perms.has(permission);
  }

  async roleHasPermission(role: TenantRole, permission: string): Promise<boolean> {
    const perms = await this.getPermissionsForRole(role);
    return perms.has(permission);
  }

  async hasAnyPermission(
    userId: string,
    tenantId: string,
    permissions: string[],
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, tenantId);
    return permissions.some((p) => userPerms.has(p));
  }

  async hasAllPermissions(
    userId: string,
    tenantId: string,
    permissions: string[],
  ): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId, tenantId);
    return permissions.every((p) => userPerms.has(p));
  }

  invalidateCache(role?: TenantRole): void {
    if (role) {
      this.rolePermissionCache.delete(role);
      this.logger.debug(`Cache invalidated for role: ${role}`);
    } else {
      this.rolePermissionCache.clear();
      this.logger.debug('Cache invalidated for all roles');
    }
  }
}