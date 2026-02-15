export const REDIS_CLIENT = 'REDIS_CLIENT';

export const REDIS_KEY_PREFIXES = {
  // Sessions (COM-108)
  SESSION: 'session:',
  USER_SESSIONS: 'user:sessions:',

  // Security (COM-109)
  FAILED_LOGIN: 'failed_login:',
  ACCOUNT_LOCKED: 'account_locked:',
  USER_DEVICES: 'user:devices:',
  USER_LOCATIONS: 'user:locations:',
  IP_BLACKLIST: 'ip:blacklist',
  SECURITY_CONFIG: 'tenant:security_config:',

  // Rate limiting
  RATE_LIMIT: 'rate_limit:',

  // Caching
  CACHE: 'cache:',
  TENANT_CONFIG: 'tenant:config:',

  // Health check
  HEALTH: 'health:',
} as const;

export const DEFAULT_TTL = {
  SESSION: 14 * 24 * 60 * 60, // 14 days
  FAILED_LOGIN: 15 * 60, // 15 minutes
  ACCOUNT_LOCKED: 30 * 60, // 30 minutes
  RATE_LIMIT: 60, // 1 minute
  CONFIG_CACHE: 5 * 60, // 5 minutes
  HEALTH: 10, // 10 seconds
} as const;
