import { RedisService } from '@lib/redis';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
  ) {}

  private get maxTtlSeconds(): number {
    return (
      this.config.get<number>('session.maxTtlSeconds') ?? 14 * 24 * 60 * 60
    );
  }

  /**
   * Invalidate all sessions for a user (all devices, all tenants).
   * Used for: password change, password reset.
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    const identitySessionIds =
      await this.sessionService.getIdentitySessionIds(userId);
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
    if (tenantSessionIds.length === 0) return;

    const pipeline = this.redis.pipeline();

    for (const tsid of tenantSessionIds) {
      const tsData = await this.redis.get<TenantSessionData>(
        SESSION_KEYS.tenantSession(tsid),
      );
      if (tsData) {
        const identitySession = await this.redis.get<IdentitySessionData>(
          SESSION_KEYS.identitySession(tsData.identitySessionId),
        );
        if (identitySession) {
          const updated: IdentitySessionData = {
            ...identitySession,
            activeTenantSessionIds:
              identitySession.activeTenantSessionIds.filter(
                (id) => id !== tsid,
              ),
          };
          pipeline.set(
            SESSION_KEYS.identitySession(tsData.identitySessionId),
            JSON.stringify(updated),
            'EX',
            this.maxTtlSeconds,
          );
        }
      }
      pipeline.del(SESSION_KEYS.tenantSession(tsid));
      pipeline.del(SESSION_KEYS.sessionActivity(tsid));
      pipeline.srem(SESSION_KEYS.userTenantSessions(userId, tenantId), tsid);
    }

    await pipeline.exec();
    this.logger.log(
      `Invalidated tenant sessions for user ${userId} in tenant ${tenantId}`,
    );
  }
}
