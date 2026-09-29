import { RedisService } from '@lib/redis';
import { Injectable, Logger } from '@nestjs/common';
import { SESSION_KEYS } from '../constants/session.constants';
import {
  IdentitySessionData,
  TenantSessionData,
} from '../interfaces/session.interface';
import { SessionService } from './session.service';

/**
 * Bulk session invalidation for security events (password change, role change, etc.).
 * Uses Redis pipeline for single round-trip batch deletes.
 */
@Injectable()
export class SessionInvalidationService {
  private readonly logger = new Logger(SessionInvalidationService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Invalidate all sessions for a user (all devices, all tenants).
   * Used for: password change (keeping the session that made the change), password reset.
   */
  async invalidateAllUserSessions(
    userId: string,
    options?: { exceptIdentitySessionId?: string },
  ): Promise<void> {
    const identitySessionIds = (
      await this.sessionService.getIdentitySessionIds(userId)
    ).filter((id) => id !== options?.exceptIdentitySessionId);
    if (identitySessionIds.length === 0) return;

    const pipeline = this.redis.pipeline();
    const keysToDelete: string[] = [];
    const setRemovals: Array<{ key: string; member: string }> = [];

    for (const identitySessionId of identitySessionIds) {
      const session = await this.redis.get<IdentitySessionData>(
        SESSION_KEYS.identitySession(identitySessionId),
      );
      if (!session) {
        setRemovals.push({
          key: SESSION_KEYS.userIdentitySessions(userId),
          member: identitySessionId,
        });
        continue;
      }

      for (const tsid of session.activeTenantSessionIds) {
        const tsData = await this.redis.get<TenantSessionData>(
          SESSION_KEYS.tenantSession(tsid),
        );
        if (tsData) {
          setRemovals.push({
            key: SESSION_KEYS.userTenantSessions(
              tsData.userId,
              tsData.tenantId,
            ),
            member: tsid,
          });
        }
        keysToDelete.push(SESSION_KEYS.tenantSession(tsid));
        keysToDelete.push(SESSION_KEYS.sessionActivity(tsid));
      }

      keysToDelete.push(SESSION_KEYS.identitySession(identitySessionId));
      keysToDelete.push(SESSION_KEYS.sessionActivity(identitySessionId));
      setRemovals.push({
        key: SESSION_KEYS.userIdentitySessions(userId),
        member: identitySessionId,
      });
    }

    for (const k of keysToDelete) {
      pipeline.del(k);
    }
    for (const { key, member } of setRemovals) {
      pipeline.srem(key, member);
    }

    await pipeline.exec();
    this.logger.log(`Invalidated all sessions for user ${userId}`);
  }

  /**
   * Cut a deactivated tenant off: its tokens are refused from now on (the marker is checked on
   * every tenant request), and every member's sessions in it end.
   */
  async revokeTenantAccess(
    tenantId: string,
    memberUserIds: string[],
  ): Promise<void> {
    await this.sessionService.markTenantInactive(tenantId);
    for (const userId of memberUserIds) {
      await this.invalidateTenantSessions(userId, tenantId);
    }
    this.logger.log(
      `Revoked access to tenant ${tenantId} (${memberUserIds.length} members)`,
    );
  }

  /** Undo revokeTenantAccess's marker when the tenant is reactivated. */
  async restoreTenantAccess(tenantId: string): Promise<void> {
    await this.sessionService.clearTenantInactive(tenantId);
  }

  /**
   * Invalidate all tenant sessions for a user in a specific tenant.
   * Used for: user removed from tenant, role change, user deactivated.
   */
  async invalidateTenantSessions(
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const tenantSessionIds = await this.sessionService.getTenantSessionIds(
      userId,
      tenantId,
    );
    // One at a time through the session service: its update of the identity session is atomic
    for (const tsid of tenantSessionIds) {
      await this.sessionService.deleteTenantSession(tsid, userId, tenantId);
    }
    this.logger.log(
      `Invalidated tenant sessions for user ${userId} in tenant ${tenantId}`,
    );
  }
}
