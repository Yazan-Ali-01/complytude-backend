import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureKey } from '../../../common/types/entitlement.types';

interface CachedSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
  cached_at: number;
}

interface CachedFeature {
  id: string;
  key: FeatureKey;
  name: string;
  feature_type: string;
  is_active: boolean;
  credit_cost?: number | null;
  cached_at: number;
}

/**
 * In-memory cache for entitlement enforcement performance optimization
 *
 * Caches subscription and feature data that rarely changes:
 * - Subscriptions: Change monthly (billing cycle) or on webhook events
 * - Features: Change only on app restart (feature sync)
 *
 * Cache invalidation:
 * - TTL-based expiration (30-60s)
 * - Webhook-based invalidation for subscription changes
 * - Manual invalidation for feature changes
 */
@Injectable()
export class EntitlementCacheService {
  private readonly logger = new Logger(EntitlementCacheService.name);

  // In-memory caches with TTL
  private readonly subscriptionCache = new Map<string, CachedSubscription>();
  private readonly featureCache = new Map<FeatureKey, CachedFeature>();

  // Cache configuration
  private readonly subscriptionTtlMs: number;
  private readonly featureTtlMs: number;

  constructor(private readonly configService: ConfigService) {
    this.subscriptionTtlMs =
      this.configService.get<number>(
        'app.entitlement.subscriptionCacheTtlSeconds',
        60, // 60 seconds default
      ) * 1000;

    this.featureTtlMs =
      this.configService.get<number>(
        'app.entitlement.featureCacheTtlSeconds',
        300, // 5 minutes default (features change rarely)
      ) * 1000;

    this.logger.log(
      `EntitlementCache initialized: subscriptionTTL=${this.subscriptionTtlMs}ms, featureTTL=${this.featureTtlMs}ms`,
    );
  }

  // ─── Subscription Cache ────────────────────────────────────────────────────

  /**
   * Get cached subscription by tenant ID
   */
  getSubscription(tenantId: string): CachedSubscription | null {
    const cached = this.subscriptionCache.get(tenantId);
    if (!cached) return null;

    // Check TTL expiration
    if (Date.now() - cached.cached_at > this.subscriptionTtlMs) {
      this.subscriptionCache.delete(tenantId);
      return null;
    }

    return cached;
  }

  /**
   * Cache subscription data
   */
  setSubscription(
    tenantId: string,
    subscription: Omit<CachedSubscription, 'cached_at'>,
  ): void {
    this.subscriptionCache.set(tenantId, {
      ...subscription,
      cached_at: Date.now(),
    });
  }

  /**
   * Invalidate subscription cache for specific tenant
   * Called by webhook handlers on subscription changes
   */
  invalidateSubscription(tenantId: string): void {
    const deleted = this.subscriptionCache.delete(tenantId);
    if (deleted) {
      this.logger.debug(
        `Invalidated subscription cache for tenant: ${tenantId}`,
      );
    }
  }

  /**
   * Clear all subscription cache entries
   * Called on application shutdown or manual cache clear
   */
  clearSubscriptionCache(): void {
    const size = this.subscriptionCache.size;
    this.subscriptionCache.clear();
    this.logger.log(`Cleared subscription cache: ${size} entries removed`);
  }

  // ─── Feature Cache ─────────────────────────────────────────────────────────

  /**
   * Get cached feature by key
   */
  getFeature(featureKey: FeatureKey): CachedFeature | null {
    const cached = this.featureCache.get(featureKey);
    if (!cached) return null;

    // Check TTL expiration
    if (Date.now() - cached.cached_at > this.featureTtlMs) {
      this.featureCache.delete(featureKey);
      return null;
    }

    return cached;
  }

  /**
   * Cache feature data
   */
  setFeature(
    featureKey: FeatureKey,
    feature: Omit<CachedFeature, 'cached_at'>,
  ): void {
    this.featureCache.set(featureKey, {
      ...feature,
      cached_at: Date.now(),
    });
  }

  /**
   * Invalidate feature cache for specific key
   */
  invalidateFeature(featureKey: FeatureKey): void {
    const deleted = this.featureCache.delete(featureKey);
    if (deleted) {
      this.logger.debug(`Invalidated feature cache for key: ${featureKey}`);
    }
  }

  /**
   * Clear all feature cache entries
   * Called on feature sync or manual cache clear
   */
  clearFeatureCache(): void {
    const size = this.featureCache.size;
    this.featureCache.clear();
    this.logger.log(`Cleared feature cache: ${size} entries removed`);
  }

  // ─── Cache Statistics ──────────────────────────────────────────────────────

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    const now = Date.now();

    // Count expired entries
    let expiredSubscriptions = 0;
    let expiredFeatures = 0;

    for (const [, subscription] of this.subscriptionCache) {
      if (now - subscription.cached_at > this.subscriptionTtlMs) {
        expiredSubscriptions++;
      }
    }

    for (const [, feature] of this.featureCache) {
      if (now - feature.cached_at > this.featureTtlMs) {
        expiredFeatures++;
      }
    }

    return {
      subscriptions: {
        total: this.subscriptionCache.size,
        expired: expiredSubscriptions,
        active: this.subscriptionCache.size - expiredSubscriptions,
      },
      features: {
        total: this.featureCache.size,
        expired: expiredFeatures,
        active: this.featureCache.size - expiredFeatures,
      },
      ttl: {
        subscriptionTtlMs: this.subscriptionTtlMs,
        featureTtlMs: this.featureTtlMs,
      },
    };
  }

  /**
   * Cleanup expired cache entries
   * Called periodically to prevent memory leaks
   */
  cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedSubscriptions = 0;
    let cleanedFeatures = 0;

    // Cleanup expired subscriptions
    for (const [tenantId, subscription] of this.subscriptionCache) {
      if (now - subscription.cached_at > this.subscriptionTtlMs) {
        this.subscriptionCache.delete(tenantId);
        cleanedSubscriptions++;
      }
    }

    // Cleanup expired features
    for (const [featureKey, feature] of this.featureCache) {
      if (now - feature.cached_at > this.featureTtlMs) {
        this.featureCache.delete(featureKey);
        cleanedFeatures++;
      }
    }

    if (cleanedSubscriptions > 0 || cleanedFeatures > 0) {
      this.logger.debug(
        `Cache cleanup: removed ${cleanedSubscriptions} subscriptions, ${cleanedFeatures} features`,
      );
    }
  }
}
