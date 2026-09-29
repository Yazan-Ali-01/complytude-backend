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
 * - tenant-inactive:{tenantId} — present while a platform admin has the tenant deactivated
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

  /** Deactivated tenant marker: tenant tokens for it are refused (no TTL; removed on reactivation) */
  inactiveTenant: (tenantId: string) => `tenant-inactive:${tenantId}`,
} as const;

/**
 * Lua script for atomic session limit enforcement.
 * Drops ids whose session is gone (TTL) or idle past the cutoff, then evicts the oldest live
 * identity session (by createdAt) when adding would exceed max per user. Without the pruning,
 * dead ids kept counting and every new login evicted a live session.
 *
 * KEYS[1] = user:identity-sessions:{userId}
 * ARGV[1] = new sessionId
 * ARGV[2] = max sessions (e.g. 5)
 * ARGV[3] = sentinel date string (ISO, larger than any real createdAt)
 * ARGV[4] = key prefix (e.g. "complytude:")
 * ARGV[5] = idle cutoff (ISO): a session last active before it is dead
 * ARGV[6] = TTL in seconds for the set (the longest a member can live)
 *
 * Returns: "0" if no eviction, or evicted sessionId if eviction occurred.
 *
 * Note: evictedId must be declared at script scope — Lua locals inside `if` are
 * not visible to the final `return` (would otherwise error as undefined global).
 */
export const SESSION_LIMIT_LUA_SCRIPT = `
local evictedId = false

for _, sid in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  local live = false
  local raw = redis.call('GET', ARGV[4] .. 'identity-session:' .. sid)
  if raw then
    local ok, decoded = pcall(cjson.decode, raw)
    if ok and type(decoded) == 'table' and type(decoded['lastActivityAt']) == 'string' then
      live = decoded['lastActivityAt'] >= ARGV[5]
    end
  end
  if not live then
    redis.call('SREM', KEYS[1], sid)
  end
end

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
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return evictedId or "0"
`;

/**
 * Lua script that updates a session's JSON in place: every write to a session goes through it,
 * so concurrent updates can't overwrite each other's fields (a touch no longer drops a tenant
 * session id added meanwhile) and a session deleted meanwhile is never written back.
 * The TTL is kept.
 *
 * KEYS[1] = identity-session:{id} or tenant-session:{id}
 * ARGV[1] = JSON object of top-level fields to set
 * ARGV[2] = '' | 'replace-tenants' (activeTenantSessionIds = [ARGV[3]]) | 'remove-tenant'
 * ARGV[3] = tenant session id for ARGV[2]
 *
 * Returns: nil if the session doesn't exist, else its activeTenantSessionIds before the update.
 */
export const SESSION_PATCH_LUA_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local ok, session = pcall(cjson.decode, raw)
if not ok or type(session) ~= 'table' then return false end

for field, value in pairs(cjson.decode(ARGV[1])) do
  session[field] = value
end

local previous = session['activeTenantSessionIds']
if type(previous) ~= 'table' then previous = {} end
if ARGV[2] == 'replace-tenants' then
  session['activeTenantSessionIds'] = { ARGV[3] }
elseif ARGV[2] == 'remove-tenant' then
  local kept = {}
  for _, id in ipairs(previous) do
    if id ~= ARGV[3] then table.insert(kept, id) end
  end
  session['activeTenantSessionIds'] = kept
end

-- cjson writes an empty Lua table as {}; the field is an array
local encoded = string.gsub(cjson.encode(session), '"activeTenantSessionIds":{}', '"activeTenantSessionIds":[]')
redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
return previous
`;

/**
 * Lua script for refresh-token rotation (compare-and-swap on the session's refresh token id).
 *
 * KEYS[1] = identity-session:{id} or tenant-session:{id}
 * ARGV[1] = jti of the presented refresh token
 * ARGV[2] = jti for the new refresh token
 * ARGV[3] = now (ISO)
 * ARGV[4] = grace cutoff (ISO): the previous token is still accepted if rotated after it
 *
 * Returns: { 'rotated', newJti } | { 'grace', currentJti } | { 'reuse' } | { 'missing' }
 */
export const REFRESH_ROTATE_LUA_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return { 'missing' } end
local ok, session = pcall(cjson.decode, raw)
if not ok or type(session) ~= 'table' then return { 'missing' } end

local current = session['refreshJti']
if type(current) == 'string' and current == ARGV[1] then
  session['previousRefreshJti'] = current
  session['refreshJti'] = ARGV[2]
  session['refreshRotatedAt'] = ARGV[3]
  local encoded = string.gsub(cjson.encode(session), '"activeTenantSessionIds":{}', '"activeTenantSessionIds":[]')
  redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
  return { 'rotated', ARGV[2] }
end

local rotatedAt = session['refreshRotatedAt']
if type(current) == 'string' and session['previousRefreshJti'] == ARGV[1]
  and type(rotatedAt) == 'string' and rotatedAt >= ARGV[4] then
  return { 'grace', current }
end

return { 'reuse' }
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

  /**
   * Seconds the refresh token just rotated away stays usable: two tabs refreshing at once both
   * present it. It gets the current token back (not a new one); after this, it is a reuse.
   */
  REFRESH_REUSE_GRACE_SECONDS: 30,
} as const;
