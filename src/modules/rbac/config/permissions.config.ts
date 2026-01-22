import { TenantRole, PermissionKey } from '../types/rbac.types';

export const PERMISSION_MATRIX: Record<TenantRole, PermissionKey[]> = {
  tenant_admin: [
    'documents:create',
    'documents:read',
    'documents:delete',
    'contracts:analyze',
    'contracts:redline',
    'templates:manage',
    'templates:use',
    'regulatory:query',
    'billing:manage',
    'team:manage',
    'settings:manage',
    'settings:change_jurisdiction',
    'pii:view_unmasked',
    'ai:use_premium_models',
  ],
  legal_counsel: [
    'documents:create',
    'documents:read',
    'documents:delete',
    'contracts:analyze',
    'contracts:redline',
    'templates:manage',
    'templates:use',
    'regulatory:query',
    'pii:view_unmasked',
    'ai:use_premium_models',
  ],
  member: [
    'documents:create',
    'documents:read',
    'templates:use',
    'regulatory:query',
  ],
  viewer: ['documents:read', 'regulatory:query'],
};

export const ROLE_HIERARCHY: TenantRole[] = [
  'tenant_admin',
  'legal_counsel',
  'member',
  'viewer',
];

export const PERMISSIONS = [
  'documents:create',
  'documents:read',
  'documents:delete',
  'contracts:analyze',
  'contracts:redline',
  'templates:manage',
  'templates:use',
  'regulatory:query',
  'billing:manage',
  'team:manage',
  'settings:manage',
  'settings:change_jurisdiction',
  'pii:view_unmasked',
  'ai:use_premium_models',
] as const satisfies readonly PermissionKey[];

export const PREMIUM_AI_MODELS = [
  'claude-3.5-sonnet',
  'claude-3.5-opus',
  'jais-70b',
  'gpt-4-turbo',
  'gpt-4o',
] as const;

export type PremiumAiModel = (typeof PREMIUM_AI_MODELS)[number];

export function isPremiumModel(modelName: string): boolean {
  return PREMIUM_AI_MODELS.some((premiumModel) =>
    modelName.toLowerCase().includes(premiumModel.toLowerCase()),
  );
}

export const ROLE_RATE_LIMITS: Record<TenantRole, { dailyLimit: number }> = {
  tenant_admin: { dailyLimit: -1 },
  legal_counsel: { dailyLimit: -1 },
  member: { dailyLimit: 5 },
  viewer: { dailyLimit: 0 },
};
