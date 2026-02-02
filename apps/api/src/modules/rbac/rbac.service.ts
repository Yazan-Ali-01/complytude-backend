import { Injectable } from '@nestjs/common';
import { Permission as PermissionType } from '../../common/types';
import { PermissionsRepository } from '../../repositories/rbac/permissions.repository';
import { RolesRepository } from '../../repositories/rbac/roles.repository';

@Injectable()
export class RbacService {
  // TODO: Implement caching - load role-permission mappings on startup
  // and cache in a Map<roleKey, Set<permissionKey>> for O(1) lookups
  // Consider cache invalidation strategy for custom roles (MVP+)
  // Example implementation:
  // private rolePermissionsCache: Map<string, Set<string>> = new Map();
  // async onModuleInit() {
  //   await this.loadRolePermissionsCache();
  // }

  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  /**
   * Check if a role has a specific permission
   * @param roleKey - Role key (e.g., 'tenant_admin', 'legal_counsel')
   * @param permissionKey - Permission key (e.g., 'documents:create')
   * @returns true if the role has the permission, false otherwise
   */
  async hasPermission(
    roleKey: string,
    permissionKey: PermissionType,
  ): Promise<boolean> {
    // TODO: Check cache first before querying database
    // if (this.rolePermissionsCache.has(roleKey)) {
    //   return this.rolePermissionsCache.get(roleKey)!.has(permissionKey);
    // }

    return this.permissionsRepository.checkRoleHasPermission(
      roleKey,
      permissionKey,
    );
  }

  /**
   * Get all permissions for a role
   * @param roleKey - Role key (e.g., 'tenant_admin')
   * @returns Array of permission keys
   */
  async getRolePermissions(roleKey: string): Promise<string[]> {
    // TODO: Check cache first before querying database
    // if (this.rolePermissionsCache.has(roleKey)) {
    //   return Array.from(this.rolePermissionsCache.get(roleKey)!);
    // }

    return this.rolesRepository.getPermissionsForRole(roleKey);
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
  //
  // async canUsePremiumModels(roleKey: string): Promise<boolean> {
  //   return this.hasPermission(roleKey, 'ai:use_premium_models');
  // }
}
