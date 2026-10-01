import { Injectable, Logger } from '@nestjs/common';
import { TENANT_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/tenant-system-roles.constant';
import { isTenantSystemRole } from '../../common/utils/tenant-type-guards.util';
import { TenantRolesRepository } from '../../repositories/tenant-rbac/tenant-roles.repository';

@Injectable()
export class TenantRbacService {
  private readonly logger = new Logger(TenantRbacService.name);

  // System roles use in-memory permission sets (TENANT_SYSTEM_ROLE_PERMISSIONS); custom tenant
  // roles are read from the database (not cached; see docs/RBAC.md → Not built yet)

  constructor(private readonly tenantRolesRepository: TenantRolesRepository) {}

  /**
   * Get all permissions for a role
   * System roles: Returns in-memory permission set (may include wildcards)
   * Custom roles: Queries database (concrete permissions only)
   *
   * @param roleKey - Role key (e.g., 'tenant_admin', 'custom_role_key')
   * @param tenantId - Tenant ID (used for custom roles, ignored for system roles)
   * @returns Array of permission keys (may include wildcards for system roles)
   */
  async getRolePermissions(
    roleKey: string,
    tenantId: string,
  ): Promise<string[]> {
    this.logger.debug(
      `Permission check: roleKey=${roleKey} tenantId=${tenantId}`,
    );
    try {
      // 1. Check system roles first (in-memory, no DB query)
      // System role keys are reserved and cannot be used by custom roles
      if (isTenantSystemRole(roleKey)) {
        const permissions = TENANT_SYSTEM_ROLE_PERMISSIONS[roleKey];
        return Array.from(permissions);
      }

      // 2. Custom tenant roles: query database (MVP+ feature)
      // Returns only concrete permissions from database
      return await this.tenantRolesRepository.getPermissionsForRole(
        roleKey,
        tenantId,
      );
    } catch (error) {
      this.logger.warn(
        `Permission lookup failed: roleKey=${roleKey} tenantId=${tenantId} - ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
