import { Injectable } from '@nestjs/common';
import { PLATFORM_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/platform-system-roles.constant';
import { isPlatformSystemRole } from '../../common/utils/platform-type-guards.util';
import { PlatformRolesRepository } from '../../repositories/platform-rbac/platform-roles.repository';

@Injectable()
export class PlatformRbacService {
  constructor(
    private readonly platformRolesRepository: PlatformRolesRepository,
  ) {}

  /**
   * Get all permissions for a platform role
   * System roles: in-memory O(1) lookup
   * Custom roles (future): single DB query
   */
  async getRolePermissions(roleKey: string): Promise<string[]> {
    if (isPlatformSystemRole(roleKey)) {
      return Array.from(PLATFORM_SYSTEM_ROLE_PERMISSIONS[roleKey]);
    }
    return this.platformRolesRepository.getPermissionsForRole(roleKey);
  }

  async getSystemRoles() {
    return this.platformRolesRepository.findSystemRoles();
  }

  async getRoleByKey(roleKey: string) {
    return this.platformRolesRepository.findByKey(roleKey);
  }
}
