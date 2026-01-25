export const TenantRoles = {
  TENANT_ADMIN: 'tenant_admin',
  LEGAL_COUNSEL: 'legal_counsel',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type TenantRole = typeof TenantRoles[keyof typeof TenantRoles];

export const RoleHierarchy: Record<TenantRole, number> = {
  tenant_admin: 4,
  legal_counsel: 3,
  member: 2,
  viewer: 1,
};