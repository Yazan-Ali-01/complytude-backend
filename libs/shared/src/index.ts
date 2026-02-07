/**
 * @complytude/shared library
 * 
 * This library contains shared modules and utilities for the Complytude monorepo.
 * 
 * Usage:
 * Import directly from specific modules for better tree-shaking:
 * 
 * @example
 * import { RedisModule } from '@complytude/shared/redis/redis.module';
 * import { RedisService } from '@complytude/shared/redis/redis.service';
 * import { RedisHealthIndicator } from '@complytude/shared/redis/redis.health';
 * import { REDIS_KEY_PREFIXES, DEFAULT_TTL } from '@complytude/shared/redis/redis.constants';
 */

// Note: Barrel exports are intentionally not used due to ESM module resolution issues
// with "module": "nodenext" in tsconfig.json. Import directly from specific files instead.
