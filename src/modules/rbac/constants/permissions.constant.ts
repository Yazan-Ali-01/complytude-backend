export const Permissions = {
  DOCUMENTS: {
    CREATE: 'documents:create',
    READ: 'documents:read',
    DELETE: 'documents:delete',
  },
  CONTRACTS: {
    ANALYZE: 'contracts:analyze',
    REDLINE: 'contracts:redline',
  },
  TEMPLATES: {
    MANAGE: 'templates:manage',
    USE: 'templates:use',
  },
  REGULATORY: {
    QUERY: 'regulatory:query',
  },
  BILLING: {
    MANAGE: 'billing:manage',
  },
  TEAM: {
    MANAGE: 'team:manage',
  },
  SETTINGS: {
    MANAGE: 'settings:manage',
    CHANGE_JURISDICTION: 'settings:change_jurisdiction',
  },
  AI: {
    VIEW_UNMASKED_PII: 'ai:view_unmasked_pii',
    USE_PREMIUM_MODELS: 'ai:use_premium_models',
  },
} as const;

export type PermissionName = typeof Permissions[keyof typeof Permissions][keyof typeof Permissions[keyof typeof Permissions]];