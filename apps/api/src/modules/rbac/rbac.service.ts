import { Injectable } from '@nestjs/common';
import { TENANT_SYSTEM_ROLE_PERMISSIONS } from '../../common/constants/tenant-system-roles.constant';
import { isTenantSystemRole } from '../../common/utils/tenant-type-guards.util';
import { RolesRepository } from '../../repositories/rbac/roles.repository';

@Injectable()
export class RbacService {
  // System roles use in-memory permission sets (TENANT_SYSTEM_ROLE_PERMISSIONS)
  // Custom tenant roles (MVP+) will query the database
  // TODO: Implement caching for custom tenant roles - load role-permissions
  // No caching needed for system roles - O(1) in-memory lookup

  constructor(private readonly rolesRepository: RolesRepository) {}

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
    // 1. Check system roles first (in-memory, no DB query)
    // System role keys are reserved and cannot be used by custom roles
    if (isTenantSystemRole(roleKey)) {
      const permissions = TENANT_SYSTEM_ROLE_PERMISSIONS[roleKey];
      return Array.from(permissions);
    }

    // 2. Custom tenant roles: query database (MVP+ feature)
    // Returns only concrete permissions from database
    return this.rolesRepository.getPermissionsForRole(roleKey, tenantId);
  }

  /**
   * Get all system roles
   */
  async getSystemRoles() {
    return this.rolesRepository.findSystemRoles();
  }

  /**
   * Get a role by key
   * @param roleKey - Role key
   * @param tenantId - Optional tenant ID for custom roles
   */
  async getRoleByKey(roleKey: string, tenantId?: string) {
    return this.rolesRepository.findByKey(roleKey, tenantId);
  }

  // TODO: AI Model Selection Gate
  // Restrict high-cost AI models (Jais-70B, Claude 3.5 Sonnet) to legal_counsel+ roles
  // Implementation:
  // 1. Create a model-tier mapping (e.g., { 'claude-3.5-sonnet': 'premium', 'gpt-4': 'premium', 'gpt-3.5': 'standard' })
  // 2. Add permission: 'ai:use_premium_models' granted only to tenant_admin and legal_counsel
  // 3. Check permission before allowing model selection in AI generation endpoints
  // 4. Use getRolePermissions() + in-memory check (same pattern as PermissionsGuard)
}
