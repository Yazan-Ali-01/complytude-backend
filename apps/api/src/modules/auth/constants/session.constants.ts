/**
 * Redis key patterns and default values for session management.
 *
 * Session keys are owned by this module (identity-session / tenant-session / indexes).
 * Keys are prefixed by the Redis client
 * (e.g. complytude:identity-session:xxx).
 *
 * Key patterns:
 * - identity-session:{id} — identity session data (hash)
 * - tenant-session:{id} — tenant session data (hash)
 * - user:identity-sessions:{userId} — SET of identity session IDs
 * - user:tenant-sessions:{userId}:{tenantId} — SET of tenant session IDs
 * - session-activity:{sessionId} — TTL key for activity throttle
 */

/** Redis key builders — keys are prefixed by Redis client (keyPrefix) */
export const SESSION_KEYS = {
  /** Identity session data: identity-session:{sessionId} */
  identitySession: (sessionId: string) => `identity-session:${sessionId}`,

  /** Tenant session data: tenant-session:{sessionId} */
  tenantSession: (sessionId: string) => `tenant-session:${sessionId}`,

  /** Secondary index: SET of identity session IDs per user */
  userIdentitySessions: (userId: string) => `user:identity-sessions:${userId}`,

  /** Secondary index: SET of tenant session IDs per user per tenant */
  userTenantSessions: (userId: string, tenantId: string) =>
    `user:tenant-sessions:${userId}:${tenantId}`,

  /** Activity throttle TTL key — prevents excessive lastActivityAt updates */
  sessionActivity: (sessionId: string) => `session-activity:${sessionId}`,
} as const;

/**
 * Lua script for atomic session limit enforcement.
 * Evicts oldest identity session (by createdAt) when adding would exceed max per user.
 *
 * KEYS[1] = user:identity-sessions:{userId}
 * ARGV[1] = new sessionId
 * ARGV[2] = max sessions (e.g. 5)
 * ARGV[3] = sentinel date string (ISO, larger than any real createdAt)
 * ARGV[4] = key prefix (e.g. "complytude:")
 *
 * Returns: "0" if no eviction, or evicted sessionId if eviction occurred.
 *
 * Note: evictedId must be declared at script scope — Lua locals inside `if` are
 * not visible to the final `return` (would otherwise error as undefined global).
 */
export const SESSION_LIMIT_LUA_SCRIPT = `
local evictedId = false

local currentCount = redis.call('SCARD', KEYS[1])
if currentCount >= tonumber(ARGV[2]) then
  local sessions = redis.call('SMEMBERS', KEYS[1])
  local oldestId = nil
  local oldestTime = ARGV[3]

  for _, sid in ipairs(sessions) do
    local sessionData = redis.call('GET', ARGV[4] .. 'identity-session:' .. sid)
    if sessionData then
      local ok, decoded = pcall(cjson.decode, sessionData)
      if ok and decoded then
        local createdAt = decoded['createdAt']
        if createdAt and createdAt < oldestTime then
          oldestTime = createdAt
          oldestId = sid
        end
      end
    end
  end

  if oldestId then
    local sessionData = redis.call('GET', ARGV[4] .. 'identity-session:' .. oldestId)
    if sessionData then
      local ok, session = pcall(cjson.decode, sessionData)
      if ok and session then
        local tenantSessionIds = session['activeTenantSessionIds'] or {}
        for _, tsid in ipairs(tenantSessionIds) do
          local tsData = redis.call('GET', ARGV[4] .. 'tenant-session:' .. tsid)
          if tsData then
            local tsOk, ts = pcall(cjson.decode, tsData)
            if tsOk and ts and ts['userId'] and ts['tenantId'] then
              redis.call('SREM', ARGV[4] .. 'user:tenant-sessions:' .. ts['userId'] .. ':' .. ts['tenantId'], tsid)
            end
          end
          redis.call('DEL', ARGV[4] .. 'tenant-session:' .. tsid)
        end
      end
    end
    redis.call('DEL', ARGV[4] .. 'identity-session:' .. oldestId)
    redis.call('SREM', KEYS[1], oldestId)
    evictedId = oldestId
  end
end

redis.call('SADD', KEYS[1], ARGV[1])
return evictedId or "0"
`;

/** Default session configuration values (overridden by env) */
export const SESSION_DEFAULTS = {
  /** Max identity sessions per user — evict oldest when exceeded */
  MAX_PER_USER: 5,

  /** Absolute max TTL in seconds (14 days) */
  MAX_TTL_SECONDS: 14 * 24 * 60 * 60,

  /** Idle timeout in seconds (72 hours) — session expired if inactive longer */
  IDLE_TIMEOUT_SECONDS: 72 * 60 * 60,

  /** Activity update throttle in seconds — min interval between lastActivityAt updates */
  ACTIVITY_THROTTLE_SECONDS: 120,
} as const;
