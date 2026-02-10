import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@complytude/shared/redis/redis.service';
import * as crypto from 'crypto';
import {
  CreateIdentitySessionInput,
  CreateTenantSessionInput,
  IdentitySession,
  TenantSession,
  SessionListItem,
} from '../interfaces/session.interface';
import {
  MAX_IDENTITY_SESSIONS_PER_USER,
  REDIS_KEYS,
  SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  SESSION_ACTIVITY_THROTTLE_SECONDS,
  SESSION_IDLE_TIMEOUT_MS,
  LUA_ENFORCE_SESSION_LIMIT,
} from '../constants/session.constants';

/**
 * SessionService - Core session management operations
 *
 * Responsibilities:
 * - Create/read/delete identity and tenant sessions
 * - Session validation (exists, not expired)
 * - Activity tracking with throttling
 * - Session limit enforcement (5 per user)
 * - Secondary index management
 *
 * Performance optimizations:
 * - TTL-based activity throttle (avoids read-before-write)
 * - Pipeline batching for multi-session operations
 * - Fire-and-forget activity updates
 * - Lua script for atomic session limit enforcement
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private sessionLimitScript: string;

  constructor(private readonly redisService: RedisService) {
    // Load Lua script SHA for session limit enforcement
    this.sessionLimitScript = LUA_ENFORCE_SESSION_LIMIT;
  }

  // ============================================
  // Identity Session Operations
  // ============================================

  /**
   * Create a new identity session
   * Enforces 5-session limit per user automatically
   *
   * @param sessionId - UUID for the new session
   * @param input - Session creation data
   * @returns Promise<IdentitySession>
   */
  async createIdentitySession(
    sessionId: string,
    input: CreateIdentitySessionInput,
  ): Promise<IdentitySession> {
    const redis = this.redisService.getClient();
    const now = new Date().toISOString();

    const session: IdentitySession = {
      ...input,
      sessionName: input.sessionName || null,
      activeTenantSessionIds: [],
      createdAt: now,
      lastActivityAt: now,
    };

    try {
      // Enforce session limit atomically using Lua script
      await redis.eval(
        this.sessionLimitScript,
        1,
        REDIS_KEYS.userIdentitySessions(input.userId),
        sessionId,
        MAX_IDENTITY_SESSIONS_PER_USER.toString(),
        'identity-session:',
      );

      // Store session data as hash
      const sessionKey = REDIS_KEYS.identitySession(sessionId);
      await redis.hmset(sessionKey, {
        userId: session.userId,
        email: session.email,
        globalRoles: JSON.stringify(session.globalRoles),
        deviceInfo: JSON.stringify(session.deviceInfo),
        ipAddress: session.ipAddress,
        geoLocation: session.geoLocation ? JSON.stringify(session.geoLocation) : '',
        serviceName: session.serviceName,
        sessionName: session.sessionName || '',
        activeTenantSessionIds: JSON.stringify(session.activeTenantSessionIds),
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      });

      // Set TTL (absolute timeout)
      await redis.expire(sessionKey, SESSION_ABSOLUTE_TIMEOUT_SECONDS);

      this.logger.log(
        `Identity session created: ${sessionId} for user ${input.userId} ` +
        `(${input.deviceInfo.deviceType}, ${input.deviceInfo.browserName})`,
      );

      return session;
    } catch (error) {
      this.logger.error(
        `Failed to create identity session for user ${input.userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get identity session by ID
   *
   * @param sessionId - Session UUID
   * @returns Promise<IdentitySession | null>
   */
  async getIdentitySession(sessionId: string): Promise<IdentitySession | null> {
    try {
      const redis = this.redisService.getClient();
      const sessionKey = REDIS_KEYS.identitySession(sessionId);

      const data = await redis.hgetall(sessionKey);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      // Check idle timeout
      const lastActivityAt = new Date(data.lastActivityAt);
      const now = new Date();
      const idleTime = now.getTime() - lastActivityAt.getTime();

      if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
        this.logger.warn(`Identity session ${sessionId} expired due to idle timeout`);
        await this.deleteIdentitySession(sessionId, data.userId);
        return null;
      }

      return {
        userId: data.userId,
        email: data.email,
        globalRoles: JSON.parse(data.globalRoles),
        deviceInfo: JSON.parse(data.deviceInfo),
        ipAddress: data.ipAddress,
        geoLocation: data.geoLocation ? JSON.parse(data.geoLocation) : null,
        serviceName: data.serviceName,
        sessionName: data.sessionName || null,
        activeTenantSessionIds: JSON.parse(data.activeTenantSessionIds),
        createdAt: data.createdAt,
        lastActivityAt: data.lastActivityAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get identity session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if identity session exists (fast check, no data retrieval)
   *
   * @param sessionId - Session UUID
   * @returns Promise<boolean>
   */
  async identitySessionExists(sessionId: string): Promise<boolean> {
    try {
      const redis = this.redisService.getClient();
      const exists = await redis.exists(REDIS_KEYS.identitySession(sessionId));
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check identity session existence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete identity session and all linked tenant sessions
   *
   * @param sessionId - Session UUID
   * @param userId - User ID (for index cleanup)
   * @returns Promise<boolean> - true if deleted, false if not found
   */
  async deleteIdentitySession(sessionId: string, userId: string): Promise<boolean> {
    try {
      const redis = this.redisService.getClient();
      const sessionKey = REDIS_KEYS.identitySession(sessionId);

      // Get session data to find linked tenant sessions
      const session = await this.getIdentitySession(sessionId);

      if (!session) {
        return false;
      }

      // Delete all linked tenant sessions
      if (session.activeTenantSessionIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const tenantSessionId of session.activeTenantSessionIds) {
          pipeline.del(REDIS_KEYS.tenantSession(tenantSessionId));
          pipeline.del(REDIS_KEYS.sessionActivityThrottle(tenantSessionId));
        }
        await pipeline.exec();
      }

      // Delete identity session
      await redis.del(sessionKey);

      // Remove from user index
      await redis.srem(REDIS_KEYS.userIdentitySessions(userId), sessionId);

      // Delete activity throttle key
      await redis.del(REDIS_KEYS.sessionActivityThrottle(sessionId));

      this.logger.log(
        `Identity session deleted: ${sessionId} (user: ${userId}, ` +
        `tenant sessions deleted: ${session.activeTenantSessionIds.length})`,
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete identity session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rename identity session (user-customizable name)
   *
   * @param sessionId - Session UUID
   * @param sessionName - New session name
   * @returns Promise<boolean>
   */
  async renameIdentitySession(sessionId: string, sessionName: string): Promise<boolean> {
    try {
      const redis = this.redisService.getClient();
      const sessionKey = REDIS_KEYS.identitySession(sessionId);

      const exists = await redis.exists(sessionKey);
      if (!exists) {
        return false;
      }

      await redis.hset(sessionKey, 'sessionName', sessionName);

      this.logger.log(`Identity session renamed: ${sessionId} → "${sessionName}"`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to rename identity session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // Tenant Session Operations
  // ============================================

  /**
   * Create a new tenant session
   * Links to parent identity session
   *
   * @param sessionId - UUID for the new session
   * @param input - Session creation data
   * @returns Promise<TenantSession>
   */
  async createTenantSession(
    sessionId: string,
    input: CreateTenantSessionInput,
  ): Promise<TenantSession> {
    const redis = this.redisService.getClient();
    const now = new Date().toISOString();

    const session: TenantSession = {
      ...input,
      createdAt: now,
      lastActivityAt: now,
    };

    try {
      // Store tenant session data as hash
      const sessionKey = REDIS_KEYS.tenantSession(sessionId);
      await redis.hmset(sessionKey, {
        userId: session.userId,
        tenantId: session.tenantId,
        role: session.role,
        identitySessionId: session.identitySessionId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      });

      // Set TTL (absolute timeout)
      await redis.expire(sessionKey, SESSION_ABSOLUTE_TIMEOUT_SECONDS);

      // Add to parent identity session's activeTenantSessionIds
      const identitySessionKey = REDIS_KEYS.identitySession(input.identitySessionId);
      const activeTenantSessionIds = await redis.hget(identitySessionKey, 'activeTenantSessionIds');
      const tenantSessionIds = activeTenantSessionIds
        ? JSON.parse(activeTenantSessionIds)
        : [];
      tenantSessionIds.push(sessionId);
      await redis.hset(
        identitySessionKey,
        'activeTenantSessionIds',
        JSON.stringify(tenantSessionIds),
      );

      // Add to secondary index (user + tenant)
      await redis.sadd(
        REDIS_KEYS.userTenantSessions(input.userId, input.tenantId),
        sessionId,
      );

      this.logger.log(
        `Tenant session created: ${sessionId} for user ${input.userId} ` +
        `in tenant ${input.tenantId} (role: ${input.role})`,
      );

      return session;
    } catch (error) {
      this.logger.error(
        `Failed to create tenant session for user ${input.userId} in tenant ${input.tenantId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get tenant session by ID
   *
   * @param sessionId - Session UUID
   * @returns Promise<TenantSession | null>
   */
  async getTenantSession(sessionId: string): Promise<TenantSession | null> {
    try {
      const redis = this.redisService.getClient();
      const sessionKey = REDIS_KEYS.tenantSession(sessionId);

      const data = await redis.hgetall(sessionKey);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      // Check idle timeout
      const lastActivityAt = new Date(data.lastActivityAt);
      const now = new Date();
      const idleTime = now.getTime() - lastActivityAt.getTime();

      if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
        this.logger.warn(`Tenant session ${sessionId} expired due to idle timeout`);
        await this.deleteTenantSession(sessionId, data.userId, data.tenantId);
        return null;
      }

      return {
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
        identitySessionId: data.identitySessionId,
        createdAt: data.createdAt,
        lastActivityAt: data.lastActivityAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get tenant session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if tenant session exists (fast check, no data retrieval)
   *
   * @param sessionId - Session UUID
   * @returns Promise<boolean>
   */
  async tenantSessionExists(sessionId: string): Promise<boolean> {
    try {
      const redis = this.redisService.getClient();
      const exists = await redis.exists(REDIS_KEYS.tenantSession(sessionId));
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check tenant session existence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete tenant session
   *
   * @param sessionId - Session UUID
   * @param userId - User ID (for index cleanup)
   * @param tenantId - Tenant ID (for index cleanup)
   * @returns Promise<boolean> - true if deleted, false if not found
   */
  async deleteTenantSession(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const redis = this.redisService.getClient();
      const sessionKey = REDIS_KEYS.tenantSession(sessionId);

      // Get session data to find parent identity session
      const session = await this.getTenantSession(sessionId);

      if (!session) {
        return false;
      }

      // Remove from parent identity session's activeTenantSessionIds
      const identitySessionKey = REDIS_KEYS.identitySession(session.identitySessionId);
      const activeTenantSessionIds = await redis.hget(
        identitySessionKey,
        'activeTenantSessionIds',
      );
      if (activeTenantSessionIds) {
        const tenantSessionIds = JSON.parse(activeTenantSessionIds).filter(
          (id: string) => id !== sessionId,
        );
        await redis.hset(
          identitySessionKey,
          'activeTenantSessionIds',
          JSON.stringify(tenantSessionIds),
        );
      }

      // Delete tenant session
      await redis.del(sessionKey);

      // Remove from user + tenant index
      await redis.srem(REDIS_KEYS.userTenantSessions(userId, tenantId), sessionId);

      // Delete activity throttle key
      await redis.del(REDIS_KEYS.sessionActivityThrottle(sessionId));

      this.logger.log(`Tenant session deleted: ${sessionId} (user: ${userId}, tenant: ${tenantId})`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to delete tenant session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // Activity Tracking (with Throttling)
  // ============================================

  /**
   * Update session activity timestamp (throttled)
   * Uses TTL-based throttle key to avoid read-before-write
   *
   * @param sessionId - Session UUID
   * @param type - 'identity' | 'tenant'
   * @returns Promise<void> (fire-and-forget)
   */
  async touchActivity(sessionId: string, type: 'identity' | 'tenant'): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      const throttleKey = REDIS_KEYS.sessionActivityThrottle(sessionId);

      // Check if throttle key exists (1 Redis op)
      const throttled = await redis.exists(throttleKey);

      if (throttled) {
        return; // Skip update, last update was < 2 minutes ago
      }

      // Fire-and-forget pipeline (don't await response)
      const sessionKey =
        type === 'identity'
          ? REDIS_KEYS.identitySession(sessionId)
          : REDIS_KEYS.tenantSession(sessionId);

      void redis
        .pipeline()
        .hset(sessionKey, 'lastActivityAt', new Date().toISOString())
        .setex(throttleKey, SESSION_ACTIVITY_THROTTLE_SECONDS, '1')
        .exec();

      // Request continues immediately, Redis update happens in background
    } catch (error) {
      // Don't throw - activity updates are non-critical
      this.logger.warn(`Failed to update activity for session ${sessionId}: ${error.message}`);
    }
  }

  /**
   * Batch validate multiple sessions (performance optimization)
   * Single Redis roundtrip for multiple session checks
   *
   * @param identitySessionId - Identity session UUID (optional)
   * @param tenantSessionId - Tenant session UUID (optional)
   * @returns Promise<{identity: boolean, tenant: boolean}>
   */
  async validateSessionsBatch(
    identitySessionId?: string,
    tenantSessionId?: string,
  ): Promise<{ identity: boolean; tenant: boolean }> {
    try {
      const redis = this.redisService.getClient();
      const pipeline = redis.pipeline();

      if (identitySessionId) {
        pipeline.exists(REDIS_KEYS.identitySession(identitySessionId));
      }
      if (tenantSessionId) {
        pipeline.exists(REDIS_KEYS.tenantSession(tenantSessionId));
      }

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      let identityIndex = 0;
      let tenantIndex = identitySessionId ? 1 : 0;

      return {
        identity: identitySessionId ? !!results[identityIndex]?.[1] : true,
        tenant: tenantSessionId ? !!results[tenantIndex]?.[1] : true,
      };
    } catch (error) {
      this.logger.error(`Failed to batch validate sessions: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // Session Listing & Management
  // ============================================

  /**
   * Get all identity sessions for a user
   *
   * @param userId - User ID
   * @returns Promise<IdentitySession[]>
   */
  async getUserIdentitySessions(userId: string): Promise<IdentitySession[]> {
    try {
      const redis = this.redisService.getClient();
      const sessionIds = await redis.smembers(REDIS_KEYS.userIdentitySessions(userId));

      if (!sessionIds || sessionIds.length === 0) {
        return [];
      }

      const sessions: IdentitySession[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.getIdentitySession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error(`Failed to get user identity sessions for ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all tenant sessions for a user in a specific tenant
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Promise<TenantSession[]>
   */
  async getUserTenantSessions(userId: string, tenantId: string): Promise<TenantSession[]> {
    try {
      const redis = this.redisService.getClient();
      const sessionIds = await redis.smembers(
        REDIS_KEYS.userTenantSessions(userId, tenantId),
      );

      if (!sessionIds || sessionIds.length === 0) {
        return [];
      }

      const sessions: TenantSession[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.getTenantSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error(
        `Failed to get user tenant sessions for ${userId} in ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Count active identity sessions for a user
   *
   * @param userId - User ID
   * @returns Promise<number>
   */
  async countUserIdentitySessions(userId: string): Promise<number> {
    try {
      const redis = this.redisService.getClient();
      return await redis.scard(REDIS_KEYS.userIdentitySessions(userId));
    } catch (error) {
      this.logger.error(`Failed to count user sessions for ${userId}: ${error.message}`);
      throw error;
    }
  }
}
