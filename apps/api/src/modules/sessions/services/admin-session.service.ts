import { RedisService } from '@complytude/shared/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import { SessionListItem } from 'src/modules/auth/interfaces/session.interface';
import { SessionInvalidationService } from './session-invalidation.service';
import { SessionService } from './session.service';

/**
 * AdminSessionService - Business logic for system admin session operations
 *
 * Responsibilities:
 * - Fetch tenant-wide sessions (all users in a tenant)
 * - Fetch user-wide sessions (all tenants for a user)
 * - Aggregate session statistics
 * - Complex filtering and data enrichment
 *
 * Architecture Pattern (Senior/Top Company Standard):
 * - Controller: HTTP concerns only (request/response handling)
 * - Service: Business logic (data fetching, aggregation, transformation)
 * - Repository: Data access (Redis operations)
 *
 * Why separate from regular SessionService:
 * - AdminSessionService: System-wide operations (cross-tenant, cross-user)
 * - SessionService: Single-session operations (CRUD for specific sessions)
 * - SessionInvalidationService: Bulk operations (invalidation, cleanup)
 *
 * This follows Single Responsibility Principle (SRP)
 */
@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get all sessions for a specific tenant
   * Scans all tenant sessions and filters by tenantId
   *
   * @param tenantId - Tenant UUID
   * @returns Promise<SessionListItem[]> - Sanitized session data
   */
  async getTenantSessions(tenantId: string): Promise<SessionListItem[]> {
    try {
      const redis = this.redisService.getClient();

      // Scan all tenant sessions
      const stream = redis.scanStream({
        match: 'complytude:tenant-session:*',
        count: 100,
      });

      const tenantSessionKeys: string[] = [];

      stream.on('data', (keys: string[]) => {
        tenantSessionKeys.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Filter by tenantId and enrich with identity session data
      const sessions: SessionListItem[] = [];

      for (const key of tenantSessionKeys) {
        const sessionData = await redis.hgetall(key);

        if (sessionData && sessionData.tenantId === tenantId) {
          // Get parent identity session for device info
          const identitySession = await this.sessionService.getIdentitySession(
            sessionData.identitySessionId,
          );

          if (identitySession) {
            sessions.push({
              sessionId: sessionData.identitySessionId,
              sessionType: 'tenant',
              deviceInfo: identitySession.deviceInfo,
              ipAddress: identitySession.ipAddress,
              geoLocation: identitySession.geoLocation,
              sessionName: identitySession.sessionName,
              tenantId: sessionData.tenantId,
              createdAt: sessionData.createdAt,
              lastActivityAt: sessionData.lastActivityAt,
              isCurrentSession: false,
            });
          }
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error(
        `Failed to get tenant sessions for ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
