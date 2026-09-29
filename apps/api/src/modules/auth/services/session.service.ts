import { RedisService } from '@lib/redis';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nContext } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import {
  REFRESH_ROTATE_LUA_SCRIPT,
  SESSION_DEFAULTS,
  SESSION_KEYS,
  SESSION_LIMIT_LUA_SCRIPT,
  SESSION_PATCH_LUA_SCRIPT,
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
import type {
  UserIdentitySessionItem,
  UserSessionGroup,
  UserSessionListResult,
  UserTenantSessionItem,
} from '../interfaces/session.interface';

/** Sentinel date for Lua script — larger than any real ISO createdAt */
const OLDEST_SENTINEL = '9999-12-31T23:59:59.999Z';

/** Outcome of presenting a refresh token (see REFRESH_ROTATE_LUA_SCRIPT). */
export type RefreshRotation =
  | { status: 'rotated' | 'grace'; jti: string }
  | { status: 'reuse' | 'missing' };

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

  /**
   * Sets top-level fields of a session atomically, keeping its TTL; nothing is written when the
   * session no longer exists. Returns the identity session's tenant session ids before the
   * update, or null when there is no session.
   */
  private async patchSession(
    key: string,
    fields: Record<string, unknown>,
    tenantChange?: { mode: 'replace-tenants' | 'remove-tenant'; id: string },
  ): Promise<string[] | null> {
    const result = (await this.redis
      .getClient()
      .eval(
        SESSION_PATCH_LUA_SCRIPT,
        1,
        key,
        JSON.stringify(fields),
        tenantChange?.mode ?? '',
        tenantChange?.id ?? '',
      )) as string[] | null;
    return result ?? null;
  }

  /**
   * Presents a refresh token's jti to its session. The current jti rotates to `nextJti`. The one
   * just rotated away, within the grace window, gets the current jti back (concurrent refreshes).
   * Anything else is a reuse of an old token.
   */
  async rotateRefreshJti(
    kind: 'identity' | 'tenant',
    sessionId: string,
    presentedJti: string,
    nextJti: string,
  ): Promise<RefreshRotation> {
    const key =
      kind === 'identity'
        ? SESSION_KEYS.identitySession(sessionId)
        : SESSION_KEYS.tenantSession(sessionId);
    const now = Date.now();
    const [status, jti] = (await this.redis
      .getClient()
      .eval(
        REFRESH_ROTATE_LUA_SCRIPT,
        1,
        key,
        presentedJti,
        nextJti,
        new Date(now).toISOString(),
        new Date(
          now - SESSION_DEFAULTS.REFRESH_REUSE_GRACE_SECONDS * 1000,
        ).toISOString(),
      )) as [RefreshRotation['status'], string?];
    return status === 'rotated' || status === 'grace'
      ? { status, jti: jti ?? '' }
      : { status };
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
      new Date(Date.now() - this.idleTimeoutSeconds * 1000).toISOString(),
      String(this.maxTtlSeconds),
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
      .then(async (data) => {
        if (!data) return;
        const patched = await this.patchSession(
          SESSION_KEYS.identitySession(sessionId),
          { lastActivityAt: new Date().toISOString() },
        );
        if (patched) {
          await this.redis.set(throttleKey, '1', this.activityThrottleSeconds);
        }
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

    // A browser holds one tenant cookie: the tenant session this switch replaces is ended, not
    // left valid server-side until it expires
    const previous = await this.patchSession(
      identityKey,
      { lastActivityAt: new Date().toISOString() },
      { mode: 'replace-tenants', id: sessionId },
    );
    await this.removeTenantSessions(
      (previous ?? []).filter((id) => id !== sessionId),
    );
  }

  /** Deletes tenant sessions and their index entries (their identity session is updated by the caller). */
  private async removeTenantSessions(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const tsid of sessionIds) {
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
      pipeline.del(SESSION_KEYS.sessionActivity(tsid));
    }
    await pipeline.exec();
  }

  /** A tenant session lives only as long as the identity session that opened it. */
  private async parentIdentityAlive(data: TenantSessionData): Promise<boolean> {
    if (!data.identitySessionId) return false;
    const parent = await this.redis.get<IdentitySessionData>(
      SESSION_KEYS.identitySession(data.identitySessionId),
    );
    return parent !== null && !this.isIdleExpired(parent.lastActivityAt);
  }

  async findTenantSessionById(
    sessionId: string,
  ): Promise<TenantSessionData | null> {
    const key = SESSION_KEYS.tenantSession(sessionId);
    const data = await this.redis.get<TenantSessionData>(key);
    if (!data) return null;
    if (
      this.isIdleExpired(data.lastActivityAt) ||
      !(await this.parentIdentityAlive(data))
    ) {
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
    return (
      !this.isIdleExpired(data.lastActivityAt) &&
      (await this.parentIdentityAlive(data))
    );
  }

  /** Whether a platform admin has deactivated the tenant (its tokens are refused). */
  async isTenantInactive(tenantId: string): Promise<boolean> {
    return this.redis.exists(SESSION_KEYS.inactiveTenant(tenantId));
  }

  async markTenantInactive(tenantId: string): Promise<void> {
    await this.redis.set(SESSION_KEYS.inactiveTenant(tenantId), true);
  }

  async clearTenantInactive(tenantId: string): Promise<void> {
    await this.redis.del(SESSION_KEYS.inactiveTenant(tenantId));
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
    await pipeline.exec();

    if (tenantData?.identitySessionId) {
      await this.patchSession(
        SESSION_KEYS.identitySession(tenantData.identitySessionId),
        {},
        { mode: 'remove-tenant', id: sessionId },
      );
    }
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
      .then(async (data) => {
        if (!data) return;
        const patched = await this.patchSession(
          SESSION_KEYS.tenantSession(sessionId),
          { lastActivityAt: new Date().toISOString() },
        );
        if (!patched) return;
        await this.redis.set(throttleKey, '1', this.activityThrottleSeconds);
        if (data.identitySessionId) {
          this.touchIdentityActivity(data.identitySessionId);
        }
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
    const patched = await this.patchSession(
      SESSION_KEYS.identitySession(sessionId),
      { geoLocation },
    );
    return patched !== null;
  }

  /** Update sessionName for an identity session */
  async updateIdentitySessionName(
    sessionId: string,
    userId: string,
    sessionName: string | null,
  ): Promise<boolean> {
    const data = await this.findIdentitySessionById(sessionId);
    if (!data || data.userId !== userId) return false;
    const patched = await this.patchSession(
      SESSION_KEYS.identitySession(sessionId),
      { sessionName },
    );
    return patched !== null;
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

  // ========== User-facing session listings ==========

  /**
   * List sessions for current tenant only.
   * Returns identity sessions that have at least one tenant session in the given tenant.
   */
  async getUserSessionsForTenant(
    userId: string,
    tenantId: string,
    currentIdentitySessionId?: string,
    currentTenantSessionId?: string,
  ): Promise<UserSessionListResult> {
    const identitySessionIds = await this.getIdentitySessionIds(userId);
    const tenantSessionIds = await this.getTenantSessionIds(userId, tenantId);

    const identityIdsWithTenantInScope = new Set<string>();
    for (const tsid of tenantSessionIds) {
      const ts = await this.findTenantSessionById(tsid);
      if (ts) identityIdsWithTenantInScope.add(ts.identitySessionId);
    }

    const sessions: UserSessionGroup[] = [];
    for (const iid of identitySessionIds) {
      if (!identityIdsWithTenantInScope.has(iid)) continue;
      const identitySession = await this.findIdentitySessionById(iid);
      if (!identitySession) continue;

      const tenantSessions: UserTenantSessionItem[] = [];
      for (const tsid of identitySession.activeTenantSessionIds) {
        const ts = await this.findTenantSessionById(tsid);
        if (!ts || ts.tenantId !== tenantId) continue;
        tenantSessions.push({
          sessionId: tsid,
          tenantId: ts.tenantId,
          role: ts.role,
          createdAt: ts.createdAt,
          lastActivityAt: ts.lastActivityAt,
          isCurrent: tsid === currentTenantSessionId,
        });
      }
      if (tenantSessions.length === 0) continue;

      sessions.push({
        identitySession: this.toUserIdentityItem(
          identitySession,
          iid,
          currentIdentitySessionId,
        ),
        tenantSessions,
      });
    }

    return { sessions };
  }

  /**
   * List all sessions across all tenants for a user.
   */
  async getUserAllSessions(
    userId: string,
    currentIdentitySessionId?: string,
    currentTenantSessionId?: string,
  ): Promise<UserSessionListResult> {
    const identitySessionIds = await this.getIdentitySessionIds(userId);
    const sessions: UserSessionGroup[] = [];

    for (const iid of identitySessionIds) {
      const identitySession = await this.findIdentitySessionById(iid);
      if (!identitySession) continue;

      const tenantSessions: UserTenantSessionItem[] = [];
      for (const tsid of identitySession.activeTenantSessionIds) {
        const ts = await this.findTenantSessionById(tsid);
        if (!ts) continue;
        tenantSessions.push({
          sessionId: tsid,
          tenantId: ts.tenantId,
          role: ts.role,
          createdAt: ts.createdAt,
          lastActivityAt: ts.lastActivityAt,
          isCurrent: tsid === currentTenantSessionId,
        });
      }

      sessions.push({
        identitySession: this.toUserIdentityItem(
          identitySession,
          iid,
          currentIdentitySessionId,
        ),
        tenantSessions,
      });
    }

    return { sessions };
  }

  private toUserIdentityItem(
    data: IdentitySessionData,
    sessionId: string,
    currentIdentitySessionId?: string,
  ): UserIdentitySessionItem {
    return {
      sessionId,
      deviceInfo: data.deviceInfo,
      ipAddress: data.ipAddress,
      geoLocation: data.geoLocation,
      sessionName: data.sessionName,
      createdAt: data.createdAt,
      lastActivityAt: data.lastActivityAt,
      isCurrent: sessionId === currentIdentitySessionId,
    };
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
   * Aggregate global session stats from Redis (SCAN + MGET).
   * Read-only — does not delete idle sessions (excludes idle-expired from counts).
   *
   * TODO: Replace SCAN with maintained Redis counters/hashes once session volume
   * grows large enough for SCAN to become a bottleneck (monitor the timing log).
   */
  async getGlobalSessionStats(): Promise<AdminSessionStatsResponseDto> {
    const start = Date.now();
    const identityKeys = await this.redis.scanKeys('*identity-session:*');
    const tenantKeys = await this.redis.scanKeys('*tenant-session:*');
    const scanMs = Date.now() - start;
    this.logger.log(
      `SCAN completed: ${identityKeys.length} identity keys, ${tenantKeys.length} tenant keys in ${scanMs}ms`,
    );

    const byTenantId: Record<string, number> = {};
    const byDeviceType: Record<string, number> = {};
    let totalIdentitySessions = 0;
    let totalTenantSessions = 0;

    const identitySids = identityKeys
      .map((k) => this.sessionIdFromScannedKey(k, 'identity-session:'))
      .filter((s): s is string => s !== null);

    if (identitySids.length > 0) {
      const identityRedisKeys = identitySids.map((sid) =>
        SESSION_KEYS.identitySession(sid),
      );
      const identityDataList: (IdentitySessionData | null)[] =
        await this.redis.mget<IdentitySessionData>(identityRedisKeys);

      for (const data of identityDataList) {
        if (!data) continue;
        if (this.isIdleExpired(data.lastActivityAt)) continue;
        totalIdentitySessions++;
        const dt = data.deviceInfo?.deviceType?.trim() || 'unknown';
        byDeviceType[dt] = (byDeviceType[dt] ?? 0) + 1;
      }
    }

    const tenantSids = tenantKeys
      .map((k) => this.sessionIdFromScannedKey(k, 'tenant-session:'))
      .filter((s): s is string => s !== null);

    if (tenantSids.length > 0) {
      const tenantRedisKeys = tenantSids.map((sid) =>
        SESSION_KEYS.tenantSession(sid),
      );
      const tenantDataList: (TenantSessionData | null)[] =
        await this.redis.mget<TenantSessionData>(tenantRedisKeys);

      for (const data of tenantDataList) {
        if (!data) continue;
        if (this.isIdleExpired(data.lastActivityAt)) continue;
        totalTenantSessions++;
        const tid = data.tenantId;
        byTenantId[tid] = (byTenantId[tid] ?? 0) + 1;
      }
    }

    return {
      totalIdentitySessions,
      totalTenantSessions,
      byTenantId,
      byDeviceType,
    };
  }

  /**
   * All tenant sessions for a tenant (sanitized). SCAN + MGET + filter by tenantId.
   */
  async getSanitizedSessionsForTenant(
    tenantId: string,
  ): Promise<AdminSessionListResponseDto> {
    const tenantKeys = await this.redis.scanKeys('*tenant-session:*');

    const tenantSids = tenantKeys
      .map((k) => this.sessionIdFromScannedKey(k, 'tenant-session:'))
      .filter((s): s is string => s !== null);

    if (tenantSids.length === 0) return { sessions: [] };

    const tenantRedisKeys = tenantSids.map((sid) =>
      SESSION_KEYS.tenantSession(sid),
    );
    const tenantDataList: (TenantSessionData | null)[] =
      await this.redis.mget<TenantSessionData>(tenantRedisKeys);

    const groups = new Map<string, AdminSanitizedTenantSessionDto[]>();
    const identityIdsToFetch = new Set<string>();

    tenantDataList.forEach((ts, i) => {
      if (!ts || ts.tenantId !== tenantId) return;
      if (this.isIdleExpired(ts.lastActivityAt)) return;
      const sid = tenantSids[i];
      if (!sid) return;

      const tenantDto = this.toAdminTenantDto(ts, sid);
      const iid = ts.identitySessionId;
      let list = groups.get(iid);
      if (!list) {
        list = [];
        groups.set(iid, list);
      }
      list.push(tenantDto);
      identityIdsToFetch.add(iid);
    });

    const identityIds = Array.from(identityIdsToFetch);
    const identityRedisKeys = identityIds.map((iid) =>
      SESSION_KEYS.identitySession(iid),
    );
    const identityDataList: (IdentitySessionData | null)[] =
      await this.redis.mget<IdentitySessionData>(identityRedisKeys);

    const identitySeen = new Map<string, AdminSanitizedIdentitySessionDto>();
    identityDataList.forEach((idata, i) => {
      if (!idata || this.isIdleExpired(idata.lastActivityAt)) return;
      const iid = identityIds[i];
      if (!iid) return;
      identitySeen.set(iid, this.toAdminIdentityDto(idata, iid));
    });

    const sessions: AdminSessionGroupDto[] = [];
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
    throw new NotFoundException(
      I18nContext.current()?.t(AuthI18n.errors.SESSION_NOT_FOUND) ??
        'Session not found',
    );
  }
}
