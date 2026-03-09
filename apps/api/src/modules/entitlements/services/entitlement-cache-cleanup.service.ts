import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntitlementCacheService } from './entitlement-cache.service';

/**
 * Entitlement Cache Cleanup Service
 *
 * Periodically cleans up expired cache entries to prevent memory leaks.
 * Runs cleanup every 5 minutes by default.
 */
@Injectable()
export class EntitlementCacheCleanupService implements OnModuleInit {
  private readonly logger = new Logger(EntitlementCacheCleanupService.name);
  private cleanupInterval?: NodeJS.Timeout;
  private readonly cleanupIntervalMs: number;

  constructor(
    private readonly entitlementCache: EntitlementCacheService,
    private readonly configService: ConfigService,
  ) {
    this.cleanupIntervalMs =
      this.configService.get<number>(
        'app.entitlement.cacheCleanupIntervalSeconds',
        300, // 5 minutes default
      ) * 1000;
  }

  onModuleInit() {
    this.startCleanupScheduler();
  }

  onModuleDestroy() {
    this.stopCleanupScheduler();
  }

  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      try {
        this.entitlementCache.cleanupExpiredEntries();
      } catch (error) {
        this.logger.error(
          `Cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }, this.cleanupIntervalMs);

    this.logger.log(
      `Cache cleanup scheduler started: interval=${this.cleanupIntervalMs}ms`,
    );
  }

  private stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      this.logger.log('Cache cleanup scheduler stopped');
    }
  }

  /**
   * Manual cache cleanup for testing or admin operations
   */
  manualCleanup(): Promise<void> {
    this.logger.log('Manual cache cleanup triggered');
    this.entitlementCache.cleanupExpiredEntries();
    return Promise.resolve();
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.entitlementCache.getCacheStats();
  }
}
