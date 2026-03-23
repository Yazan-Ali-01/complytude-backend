import { Injectable, Logger } from '@nestjs/common';
import { PLATFORM_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/platform-system-roles.constant';
import { isPlatformSystemRole } from '../../common/utils/platform-type-guards.util';
import { PlatformRolesRepository } from '../../repositories/platform-rbac/platform-roles.repository';

@Injectable()
export class PlatformRbacService {
  private readonly logger = new Logger(PlatformRbacService.name);

  constructor(
    private readonly platformRolesRepository: PlatformRolesRepository,
  ) {}

  /**
   * Get all permissions for a platform role
   * System roles: in-memory O(1) lookup
   * Custom roles (future): single DB query
   */
  async getRolePermissions(roleKey: string): Promise<string[]> {
    this.logger.debug(`Permission check: roleKey=${roleKey}`);
    try {
      if (isPlatformSystemRole(roleKey)) {
        return Array.from(PLATFORM_SYSTEM_ROLE_PERMISSIONS[roleKey]);
      }
      return await this.platformRolesRepository.getPermissionsForRole(roleKey);
    } catch (error) {
      this.logger.warn(
        `Permission lookup failed: roleKey=${roleKey} - ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getSystemRoles() {
    this.logger.debug('Fetching platform system roles');
    try {
      return await this.platformRolesRepository.findSystemRoles();
    } catch (error) {
      this.logger.warn(
        `System roles lookup failed - ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getRoleByKey(roleKey: string) {
    this.logger.debug(`Role lookup: roleKey=${roleKey}`);
    try {
      const role = await this.platformRolesRepository.findByKey(roleKey);
      if (!role) {
        this.logger.warn(`Role not found: roleKey=${roleKey}`);
      }
      return role;
    } catch (error) {
      this.logger.warn(
        `Role lookup failed: roleKey=${roleKey} - ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
