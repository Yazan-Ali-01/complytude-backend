import { RedisService } from '@lib/redis';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESSION_DEFAULTS,
  SESSION_KEYS,
  SESSION_LIMIT_LUA_SCRIPT,
} from '../constants/session.constants';
import type {
  AdminSanitizedIdentitySessionDto,
  AdminSanitizedTenantSessionDto,
  AdminSessionGroupDto,
  AdminSessionListResponseDto,
  AdminSessionStatsResponseDto,
} from '../dto/admin-session.dto';
import type { GeoLocation } from '../interfaces/session.interface';
import {
  IdentitySessionData,
  TenantSessionData,
} from '../interfaces/session.interface';

/** Sentinel date for Lua script — larger than any real ISO createdAt */
const OLDEST_SENTINEL = '9999-12-31T23:59:59.999Z';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get maxTtlSeconds(): number {
    return (
      this.config.get<number>('session.maxTtlSeconds') ??
      SESSION_DEFAULTS.MAX_TTL_SECONDS
    );
  }

  private get idleTimeoutSeconds(): number {
    return (
      this.config.get<number>('session.idleTimeoutSeconds') ??
      SESSION_DEFAULTS.IDLE_TIMEOUT_SECONDS
    );
  }

  private get maxPerUser(): number {
    return (
      this.config.get<number>('session.maxPerUser') ??
      SESSION_DEFAULTS.MAX_PER_USER
    );
  }

  private get activityThrottleSeconds(): number {
    return (
      this.config.get<number>('session.activityThrottleSeconds') ??
      SESSION_DEFAULTS.ACTIVITY_THROTTLE_SECONDS
    );
  }

  private get keyPrefix(): string {
    return this.config.get<string>('redis.keyPrefix') ?? '';
  }

  /** Check if session has exceeded idle timeout based on lastActivityAt */
  private isIdleExpired(lastActivityAt: string): boolean {
    const last = new Date(lastActivityAt).getTime();
    const now = Date.now();
    return now - last > this.idleTimeoutSeconds * 1000;
  }

  // ========== Identity Session CRUD ==========

  /**
   * Enforce session limit: evict oldest if at capacity, then add new sessionId to SET.
   * Call before createIdentitySession.
   */
  async enforceSessionLimit(
    userId: string,
    newSessionId: string,
  ): Promise<string | null> {
    const key = SESSION_KEYS.userIdentitySessions(userId);
    const client = this.redis.getClient();
    const evicted = await client.eval(
      SESSION_LIMIT_LUA_SCRIPT,
      1,
      key,
      newSessionId,
      String(this.maxPerUser),
      OLDEST_SENTINEL,
      this.keyPrefix,
    );
    const result = Array.isArray(evicted) ? evicted[0] : evicted;
    return result === '0' || result === 0 ? null : String(result);
  }

  /** Create identity session. Call enforceSessionLimit first. */
  async createIdentitySession(
    sessionId: string,
    data: IdentitySessionData,
  ): Promise<void> {
    const key = SESSION_KEYS.identitySession(sessionId);
    await this.redis.set(key, data, this.maxTtlSeconds);
  }

  async findIdentitySessionById(
    sessionId: string,
  ): Promise<IdentitySessionData | null> {
    const key = SESSION_KEYS.identitySession(sessionId);
    const data = await this.redis.get<IdentitySessionData>(key);
    if (!data) return null;
    if (this.isIdleExpired(data.lastActivityAt)) {
      await this.deleteIdentitySession(sessionId, data.userId);
      return null;
    }
    return data;
  }

  async identitySessionExists(sessionId: string): Promise<boolean> {
    const data = await this.findIdentitySessionById(sessionId);
    return data !== null;
  }

  /**
   * Pure existence check without side effects (no idle-expiry deletion).
   * Use in guards for graceful degradation.
   */
  async identitySessionExistsPure(sessionId: string): Promise<boolean> {
    const key = SESSION_KEYS.identitySession(sessionId);
    const data = await this.redis.get<IdentitySessionData>(key);
    if (!data) return false;
    return !this.isIdleExpired(data.lastActivityAt);
  }

  /** Delete identity session and cascade to all linked tenant sessions */
  async deleteIdentitySession(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const session = await this.redis.get<IdentitySessionData>(
      SESSION_KEYS.identitySession(sessionId),
    );
    if (!session) {
      await this.redis.del(SESSION_KEYS.identitySession(sessionId));
      await this.redis.srem(
        SESSION_KEYS.userIdentitySessions(userId),
        sessionId,
      );
      return;
    }

    const pipeline = this.redis.pipeline();

    for (const tsid of session.activeTenantSessionIds) {
      const tsData = await this.redis.get<TenantSessionData>(
        SESSION_KEYS.tenantSession(tsid),
      );
      if (tsData) {
        pipeline.srem(
          SESSION_KEYS.userTenantSessions(tsData.userId, tsData.tenantId),
          tsid,
        );
      }
      pipeline.del(SESSION_KEYS.tenantSession(tsid));
    }

    pipeline.del(SESSION_KEYS.identitySession(sessionId));
    pipeline.del(SESSION_KEYS.sessionActivity(sessionId));
    pipeline.srem(SESSION_KEYS.userIdentitySessions(userId), sessionId);

    await pipeline.exec();
  }

  /**
   * Update lastActivityAt. Throttled via session-activity:{id} TTL key.
   * Fire-and-forget: does not await. Call with void.
   */
  touchIdentityActivity(sessionId: string): void {
    const throttleKey = SESSION_KEYS.sessionActivity(sessionId);
    this.redis
      .exists(throttleKey)
      .then((exists) => {
        if (exists) return;
        return this.redis.get<IdentitySessionData>(
          SESSION_KEYS.identitySession(sessionId),
        );
      })
      .then((data) => {
        if (!data) return;
        const throttleKey = SESSION_KEYS.sessionActivity(sessionId);
        const updated: IdentitySessionData = {
          ...data,
          lastActivityAt: new Date().toISOString(),
        };
        return Promise.all([
          this.redis.set(
            SESSION_KEYS.identitySession(sessionId),
            updated,
            this.maxTtlSeconds,
          ),
          this.redis.set(throttleKey, '1', this.activityThrottleSeconds),
        ]);
      })
      .catch((err) =>
        this.logger.warn(`Failed to touch identity session activity: ${err}`),
      );
  }

  // ========== Tenant Session CRUD ==========

  async createTenantSession(
    sessionId: string,
    data: TenantSessionData,
    identitySessionId: string,
  ): Promise<void> {
    const identityKey = SESSION_KEYS.identitySession(identitySessionId);
    const identityTtl = await this.redis.ttl(identityKey);
    const tenantTtl =
      identityTtl > 0
        ? Math.min(identityTtl, this.maxTtlSeconds)
        : this.maxTtlSeconds;

    const key = SESSION_KEYS.tenantSession(sessionId);
    await this.redis.set(key, data, tenantTtl);

    await this.redis.sadd(
      SESSION_KEYS.userTenantSessions(data.userId, data.tenantId),
      sessionId,
    );

    const identitySession =
      await this.redis.get<IdentitySessionData>(identityKey);
    if (identitySession) {
      const updated = {
        ...identitySession,
        activeTenantSessionIds: [
          ...identitySession.activeTenantSessionIds,
          sessionId,
        ],
        lastActivityAt: new Date().toISOString(),
      };
      await this.redis.set(identityKey, updated, this.maxTtlSeconds);
    }
  }

  async findTenantSessionById(
    sessionId: string,
  ): Promise<TenantSessionData | null> {
    const key = SESSION_KEYS.tenantSession(sessionId);
    const data = await this.redis.get<TenantSessionData>(key);
    if (!data) return null;
    if (this.isIdleExpired(data.lastActivityAt)) {
      await this.deleteTenantSession(sessionId, data.userId, data.tenantId);
      return null;
    }
    return data;
  }

  async tenantSessionExists(sessionId: string): Promise<boolean> {
    const data = await this.findTenantSessionById(sessionId);
    return data !== null;
  }

  /**
   * Pure existence check without side effects (no idle-expiry deletion).
   * Use in guards for graceful degradation.
   */
  async tenantSessionExistsPure(sessionId: string): Promise<boolean> {
    const key = SESSION_KEYS.tenantSession(sessionId);
    const data = await this.redis.get<TenantSessionData>(key);
    if (!data) return false;
    return !this.isIdleExpired(data.lastActivityAt);
  }

  async deleteTenantSession(
    sessionId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const tenantData = await this.redis.get<TenantSessionData>(
      SESSION_KEYS.tenantSession(sessionId),
    );

    const pipeline = this.redis.pipeline();
    pipeline.del(SESSION_KEYS.tenantSession(sessionId));
    pipeline.del(SESSION_KEYS.sessionActivity(sessionId));
    pipeline.srem(SESSION_KEYS.userTenantSessions(userId, tenantId), sessionId);

    if (tenantData) {
      const identitySession = await this.redis.get<IdentitySessionData>(
        SESSION_KEYS.identitySession(tenantData.identitySessionId),
      );
      if (identitySession) {
        const updated: IdentitySessionData = {
          ...identitySession,
          activeTenantSessionIds: identitySession.activeTenantSessionIds.filter(
            (id) => id !== sessionId,
          ),
        };
        pipeline.set(
          SESSION_KEYS.identitySession(tenantData.identitySessionId),
          JSON.stringify(updated),
          'EX',
          this.maxTtlSeconds,
        );
      }
    }

    await pipeline.exec();
  }

  /**
   * Touch tenant session activity. Throttled. Fire-and-forget.
   * Also touches the parent identity session to prevent it from idle-expiring.
   */
  touchTenantActivity(sessionId: string): void {
    const throttleKey = SESSION_KEYS.sessionActivity(sessionId);
    this.redis
      .exists(throttleKey)
      .then((exists) => {
        if (exists) return;
        return this.redis.get<TenantSessionData>(
          SESSION_KEYS.tenantSession(sessionId),
        );
      })
      .then((data) => {
        if (!data) return;
        const now = new Date().toISOString();
        const updated: TenantSessionData = {
          ...data,
          lastActivityAt: now,
        };
        const promises: Promise<unknown>[] = [
          this.redis.set(
            SESSION_KEYS.tenantSession(sessionId),
            updated,
            this.maxTtlSeconds,
          ),
          this.redis.set(throttleKey, '1', this.activityThrottleSeconds),
        ];
        if (data.identitySessionId) {
          this.touchIdentityActivity(data.identitySessionId);
        }
        return Promise.all(promises);
      })
      .catch((err) =>
        this.logger.warn(`Failed to touch tenant session activity: ${err}`),
      );
  }

  /** Update geoLocation for an identity session (fire-and-forget enrichment) */
  async updateIdentitySessionGeo(
    sessionId: string,
    userId: string,
    geoLocation: GeoLocation,
  ): Promise<boolean> {
    const data = await this.findIdentitySessionById(sessionId);
    if (!data || data.userId !== userId) return false;
    const updated = { ...data, geoLocation };
    await this.redis.set(
      SESSION_KEYS.identitySession(sessionId),
      updated,
      this.maxTtlSeconds,
    );
    return true;
  }

  /** Update sessionName for an identity session */
  async updateIdentitySessionName(
    sessionId: string,
    userId: string,
    sessionName: string | null,
  ): Promise<boolean> {
    const data = await this.findIdentitySessionById(sessionId);
    if (!data || data.userId !== userId) return false;
    const updated = { ...data, sessionName };
    await this.redis.set(
      SESSION_KEYS.identitySession(sessionId),
      updated,
      this.maxTtlSeconds,
    );
    return true;
  }

  /** Get all identity session IDs for a user */
  async getIdentitySessionIds(userId: string): Promise<string[]> {
    return this.redis.smembers(SESSION_KEYS.userIdentitySessions(userId));
  }

  /** Get all tenant session IDs for user in tenant */
  async getTenantSessionIds(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    return this.redis.smembers(
      SESSION_KEYS.userTenantSessions(userId, tenantId),
    );
  }

  // ========== System admin (read-only stats + sanitized listings) ==========

  private stripKeyPrefix(fullKey: string): string {
    const p = this.keyPrefix;
    if (p && fullKey.startsWith(p)) return fullKey.slice(p.length);
    return fullKey;
  }

  private async peekIdentitySessionData(
    sessionId: string,
  ): Promise<IdentitySessionData | null> {
    const data = await this.redis.get<IdentitySessionData>(
      SESSION_KEYS.identitySession(sessionId),
    );
    if (!data) return null;
    if (this.isIdleExpired(data.lastActivityAt)) return null;
    return data;
  }

  private async peekTenantSessionData(
    sessionId: string,
  ): Promise<TenantSessionData | null> {
    const data = await this.redis.get<TenantSessionData>(
      SESSION_KEYS.tenantSession(sessionId),
    );
    if (!data) return null;
    if (this.isIdleExpired(data.lastActivityAt)) return null;
    return data;
  }

  private sessionIdFromScannedKey(
    fullKey: string,
    prefix: 'identity-session:' | 'tenant-session:',
  ): string | null {
    const logical = this.stripKeyPrefix(fullKey);
    if (!logical.startsWith(prefix)) return null;
    return logical.slice(prefix.length) || null;
  }

  private durationSeconds(createdAt: string): number {
    const start = new Date(createdAt).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 1000));
  }

  private toAdminIdentityDto(
    data: IdentitySessionData,
    sessionId: string,
  ): AdminSanitizedIdentitySessionDto {
    const deviceType = data.deviceInfo?.deviceType?.trim() || 'unknown';
    return {
      sessionId,
      userId: data.userId,
      deviceInfo: {
        deviceType,
        browserName: data.deviceInfo?.browserName ?? 'Unknown',
        browserVersion: data.deviceInfo?.browserVersion ?? 'Unknown',
        operatingSystem: data.deviceInfo?.operatingSystem ?? 'Unknown',
      },
      ipAddress: data.ipAddress,
      geoLocation: data.geoLocation,
      createdAt: data.createdAt,
      lastActivityAt: data.lastActivityAt,
      durationSeconds: this.durationSeconds(data.createdAt),
    };
  }

  private toAdminTenantDto(
    data: TenantSessionData,
    sessionId: string,
  ): AdminSanitizedTenantSessionDto {
    return {
      sessionId,
      userId: data.userId,
      tenantId: data.tenantId,
      role: data.role,
      createdAt: data.createdAt,
      lastActivityAt: data.lastActivityAt,
      durationSeconds: this.durationSeconds(data.createdAt),
    };
  }

  /**
   * Aggregate global session stats from Redis (SCAN). Read-only — does not
   * delete idle sessions (excludes idle-expired from counts).
   */
  async getGlobalSessionStats(): Promise<AdminSessionStatsResponseDto> {
    const identityKeys = await this.redis.scanKeys('*identity-session:*');
    const tenantKeys = await this.redis.scanKeys('*tenant-session:*');

    const byTenantId: Record<string, number> = {};
    const byDeviceType: Record<string, number> = {};
    let totalIdentitySessions = 0;
    let totalTenantSessions = 0;

    for (const fullKey of identityKeys) {
      const sid = this.sessionIdFromScannedKey(fullKey, 'identity-session:');
      if (!sid) continue;
      const data = await this.peekIdentitySessionData(sid);
      if (!data) continue;
      totalIdentitySessions++;
      const dt = data.deviceInfo?.deviceType?.trim() || 'unknown';
      byDeviceType[dt] = (byDeviceType[dt] ?? 0) + 1;
    }

    for (const fullKey of tenantKeys) {
      const sid = this.sessionIdFromScannedKey(fullKey, 'tenant-session:');
      if (!sid) continue;
      const data = await this.peekTenantSessionData(sid);
      if (!data) continue;
      totalTenantSessions++;
      const tid = data.tenantId;
      byTenantId[tid] = (byTenantId[tid] ?? 0) + 1;
    }

    return {
      totalIdentitySessions,
      totalTenantSessions,
      byTenantId,
      byDeviceType,
    };
  }

  /**
   * All tenant sessions for a tenant (sanitized). SCAN + filter by tenantId.
   */
  async getSanitizedSessionsForTenant(
    tenantId: string,
  ): Promise<AdminSessionListResponseDto> {
    const tenantKeys = await this.redis.scanKeys('*tenant-session:*');
    const sessions: AdminSessionGroupDto[] = [];
    const identitySeen = new Map<string, AdminSanitizedIdentitySessionDto>();
    const groups = new Map<string, AdminSanitizedTenantSessionDto[]>();

    for (const fullKey of tenantKeys) {
      const sid = this.sessionIdFromScannedKey(fullKey, 'tenant-session:');
      if (!sid) continue;
      const ts = await this.peekTenantSessionData(sid);
      if (!ts || ts.tenantId !== tenantId) continue;

      const tenantDto = this.toAdminTenantDto(ts, sid);
      const iid = ts.identitySessionId;
      let list = groups.get(iid);
      if (!list) {
        list = [];
        groups.set(iid, list);
      }
      list.push(tenantDto);

      if (!identitySeen.has(iid)) {
        const idata = await this.peekIdentitySessionData(iid);
        if (idata) {
          identitySeen.set(iid, this.toAdminIdentityDto(idata, iid));
        }
      }
    }

    for (const [iid, tenantSessions] of groups) {
      const identitySession = identitySeen.get(iid);
      if (!identitySession) continue;
      sessions.push({ identitySession, tenantSessions });
    }

    return { sessions };
  }

  /**
   * All sessions for a user across tenants (sanitized), grouped by identity session.
   */
  async getSanitizedSessionsForUser(
    userId: string,
  ): Promise<AdminSessionListResponseDto> {
    const identitySessionIds = await this.getIdentitySessionIds(userId);
    const sessions: AdminSessionGroupDto[] = [];

    for (const iid of identitySessionIds) {
      const identityData = await this.peekIdentitySessionData(iid);
      if (!identityData || identityData.userId !== userId) continue;

      const tenantSessions: AdminSanitizedTenantSessionDto[] = [];
      for (const tsid of identityData.activeTenantSessionIds) {
        const ts = await this.peekTenantSessionData(tsid);
        if (!ts || ts.userId !== userId) continue;
        tenantSessions.push(this.toAdminTenantDto(ts, tsid));
      }

      sessions.push({
        identitySession: this.toAdminIdentityDto(identityData, iid),
        tenantSessions,
      });
    }

    return { sessions };
  }

  /**
   * Delete any session by id (identity or tenant). System admin only.
   */
  async deleteAnySessionById(sessionId: string): Promise<void> {
    const idRaw = await this.redis.get<IdentitySessionData>(
      SESSION_KEYS.identitySession(sessionId),
    );
    if (idRaw) {
      await this.deleteIdentitySession(sessionId, idRaw.userId);
      return;
    }
    const tRaw = await this.redis.get<TenantSessionData>(
      SESSION_KEYS.tenantSession(sessionId),
    );
    if (tRaw) {
      await this.deleteTenantSession(sessionId, tRaw.userId, tRaw.tenantId);
      return;
    }
    throw new NotFoundException('Session not found');
  }
}
