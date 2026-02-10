import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@complytude/shared/redis/redis.service';
import { SessionService } from './session.service';
import { REDIS_KEYS } from '../constants/session.constants';

/**
 * SessionInvalidationService - Bulk session cleanup for security events
 *
 * Responsibilities:
 * - Invalidate all user sessions (password change, email change, etc.)
 * - Invalidate tenant-specific sessions (role change, user removal)
 * - Cleanup orphaned sessions
 * - Support for selective invalidation (by session ID, user, tenant)
 *
 * Security Events Triggering Session Invalidation:
 * 1. Password change → Invalidate ALL user sessions
 * 2. Email change → Invalidate ALL user sessions
 * 3. Password reset → Invalidate ALL user sessions
 * 4. Role change → Invalidate tenant sessions for that tenant
 * 5. User deactivation → Invalidate ALL user sessions
 * 6. User removal from tenant → Invalidate tenant sessions
 * 7. Admin force-logout → Invalidate specific/all sessions
 */
@Injectable()
export class SessionInvalidationService {
  private readonly logger = new Logger(SessionInvalidationService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Invalidate ALL sessions for a user (all tenants, all devices)
   * Triggered by: password change, email change, password reset, user deactivation
   *
   * @param userId - User ID
   * @param reason - Reason for invalidation (for logging)
   * @returns Promise<number> - Number of sessions invalidated
   */
  async invalidateAllUserSessions(userId: string, reason: string): Promise<number> {
    try {
      const redis = this.redisService.getClient();
      let totalInvalidated = 0;

      // Get all identity sessions for user
      const identitySessionIds = await redis.smembers(
        REDIS_KEYS.userIdentitySessions(userId),
      );

      if (!identitySessionIds || identitySessionIds.length === 0) {
        this.logger.log(`No sessions to invalidate for user ${userId} (reason: ${reason})`);
        return 0;
      }

      // Delete each identity session (and its linked tenant sessions)
      for (const sessionId of identitySessionIds) {
        const deleted = await this.sessionService.deleteIdentitySession(sessionId, userId);
        if (deleted) {
          totalInvalidated++;
        }
      }

      this.logger.warn(
        `Invalidated ${totalInvalidated} identity sessions for user ${userId} ` +
        `(reason: ${reason})`,
      );

      return totalInvalidated;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate all sessions for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Invalidate all tenant sessions for a user in a specific tenant
   * Triggered by: role change, user removal from tenant
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param reason - Reason for invalidation (for logging)
   * @returns Promise<number> - Number of sessions invalidated
   */
  async invalidateUserTenantSessions(
    userId: string,
    tenantId: string,
    reason: string,
  ): Promise<number> {
    try {
      const redis = this.redisService.getClient();
      let totalInvalidated = 0;

      // Get all tenant sessions for user in this tenant
      const tenantSessionIds = await redis.smembers(
        REDIS_KEYS.userTenantSessions(userId, tenantId),
      );

      if (!tenantSessionIds || tenantSessionIds.length === 0) {
        this.logger.log(
          `No tenant sessions to invalidate for user ${userId} in tenant ${tenantId} ` +
          `(reason: ${reason})`,
        );
        return 0;
      }

      // Delete each tenant session
      for (const sessionId of tenantSessionIds) {
        const deleted = await this.sessionService.deleteTenantSession(
          sessionId,
          userId,
          tenantId,
        );
        if (deleted) {
          totalInvalidated++;
        }
      }

      this.logger.warn(
        `Invalidated ${totalInvalidated} tenant sessions for user ${userId} ` +
        `in tenant ${tenantId} (reason: ${reason})`,
      );

      return totalInvalidated;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate tenant sessions for user ${userId} in tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Invalidate all sessions in a tenant (for all users)
   * Triggered by: tenant suspension, bulk security action
   *
   * @param tenantId - Tenant ID
   * @param reason - Reason for invalidation (for logging)
   * @returns Promise<number> - Number of sessions invalidated
   */
  async invalidateAllTenantSessions(tenantId: string, reason: string): Promise<number> {
    try {
      const redis = this.redisService.getClient();
      let totalInvalidated = 0;

      // Scan for all tenant session keys for this tenant
      // Pattern: tenant-session:* where tenantId matches
      const stream = redis.scanStream({
        match: 'complytude:tenant-session:*',
        count: 100,
      });

      const sessionIds: string[] = [];

      stream.on('data', (keys: string[]) => {
        sessionIds.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Filter sessions by tenantId and delete
      for (const key of sessionIds) {
        const sessionData = await redis.hgetall(key);
        if (sessionData && sessionData.tenantId === tenantId) {
          const sessionId = key.replace('complytude:tenant-session:', '');
          const deleted = await this.sessionService.deleteTenantSession(
            sessionId,
            sessionData.userId,
            tenantId,
          );
          if (deleted) {
            totalInvalidated++;
          }
        }
      }

      this.logger.warn(
        `Invalidated ${totalInvalidated} sessions in tenant ${tenantId} (reason: ${reason})`,
      );

      return totalInvalidated;
    } catch (error) {
      this.logger.error(
        `Failed to invalidate all sessions in tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Invalidate a specific session by ID
   * Triggered by: admin force-logout, user logout from specific device
   *
   * @param sessionId - Session UUID
   * @param sessionType - 'identity' | 'tenant'
   * @param userId - User ID (for index cleanup)
   * @param tenantId - Tenant ID (only for tenant sessions)
   * @returns Promise<boolean> - true if session was found and deleted
   */
  async invalidateSession(
    sessionId: string,
    sessionType: 'identity' | 'tenant',
    userId: string,
    tenantId?: string,
  ): Promise<boolean> {
    try {
      if (sessionType === 'identity') {
        return await this.sessionService.deleteIdentitySession(sessionId, userId);
      } else if (sessionType === 'tenant' && tenantId) {
        return await this.sessionService.deleteTenantSession(sessionId, userId, tenantId);
      }

      this.logger.warn(
        `Invalid invalidateSession call: sessionType=${sessionType}, tenantId=${tenantId}`,
      );
      return false;
    } catch (error) {
      this.logger.error(`Failed to invalidate session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup orphaned session index entries
   * Scans user index SETs and removes entries where session no longer exists
   * Should be run periodically as maintenance task
   *
   * @returns Promise<number> - Number of orphaned entries cleaned
   */
  async cleanupOrphanedIndexEntries(): Promise<number> {
    try {
      const redis = this.redisService.getClient();
      let totalCleaned = 0;

      // Scan for all user:identity-sessions:* keys
      const stream = redis.scanStream({
        match: 'complytude:user:identity-sessions:*',
        count: 100,
      });

      const userIndexKeys: string[] = [];

      stream.on('data', (keys: string[]) => {
        userIndexKeys.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // For each user index, check if sessions still exist
      for (const indexKey of userIndexKeys) {
        const sessionIds = await redis.smembers(indexKey);

        for (const sessionId of sessionIds) {
          const exists = await this.sessionService.identitySessionExists(sessionId);
          if (!exists) {
            await redis.srem(indexKey, sessionId);
            totalCleaned++;
          }
        }
      }

      if (totalCleaned > 0) {
        this.logger.log(`Cleaned up ${totalCleaned} orphaned session index entries`);
      }

      return totalCleaned;
    } catch (error) {
      this.logger.error(`Failed to cleanup orphaned index entries: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get comprehensive session statistics (for monitoring)
   *
   * @returns Promise<SessionStats>
   */
  async getSessionStats(): Promise<{
    totalIdentity: number;
    totalTenant: number;
    sessionsByTenant: Record<string, number>;
    sessionsByDeviceType: Record<string, number>;
    activeUsersLast24h: number;
    activeUsersLast7d: number;
  }> {
    try {
      const redis = this.redisService.getClient();

      // Scan all identity sessions
      const identityStream = redis.scanStream({
        match: 'complytude:identity-session:*',
        count: 100,
      });

      const identitySessionKeys: string[] = [];

      identityStream.on('data', (keys: string[]) => {
        identitySessionKeys.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        identityStream.on('end', resolve);
        identityStream.on('error', reject);
      });

      // Scan all tenant sessions
      const tenantStream = redis.scanStream({
        match: 'complytude:tenant-session:*',
        count: 100,
      });

      const tenantSessionKeys: string[] = [];

      tenantStream.on('data', (keys: string[]) => {
        tenantSessionKeys.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        tenantStream.on('end', resolve);
        tenantStream.on('error', reject);
      });

      // Aggregate statistics
      const sessionsByTenant: Record<string, number> = {};
      const sessionsByDeviceType: Record<string, number> = {};
      const uniqueUsersLast24h = new Set<string>();
      const uniqueUsersLast7d = new Set<string>();
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // Process identity sessions for device type and active users
      for (const key of identitySessionKeys) {
        const sessionData = await redis.hgetall(key);
        
        if (sessionData && sessionData.userId) {
          // Parse device info for device type stats
          if (sessionData.deviceInfo) {
            try {
              const deviceInfo = JSON.parse(sessionData.deviceInfo);
              const deviceType = deviceInfo.deviceType || 'unknown';
              sessionsByDeviceType[deviceType] = (sessionsByDeviceType[deviceType] || 0) + 1;
            } catch {
              // Ignore parsing errors
            }
          }

          // Track active users
          if (sessionData.lastActivityAt) {
            const lastActivity = new Date(sessionData.lastActivityAt).getTime();
            if (lastActivity >= sevenDaysAgo) {
              uniqueUsersLast7d.add(sessionData.userId);
            }
            if (lastActivity >= oneDayAgo) {
              uniqueUsersLast24h.add(sessionData.userId);
            }
          }
        }
      }

      // Process tenant sessions for tenant stats
      for (const key of tenantSessionKeys) {
        const sessionData = await redis.hgetall(key);
        
        if (sessionData && sessionData.tenantId) {
          const tenantId = sessionData.tenantId;
          sessionsByTenant[tenantId] = (sessionsByTenant[tenantId] || 0) + 1;
        }
      }

      return {
        totalIdentity: identitySessionKeys.length,
        totalTenant: tenantSessionKeys.length,
        sessionsByTenant,
        sessionsByDeviceType,
        activeUsersLast24h: uniqueUsersLast24h.size,
        activeUsersLast7d: uniqueUsersLast7d.size,
      };
    } catch (error) {
      this.logger.error(`Failed to get session stats: ${error.message}`);
      throw error;
    }
  }
}
