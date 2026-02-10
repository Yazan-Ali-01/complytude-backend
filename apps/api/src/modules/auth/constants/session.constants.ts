/**
 * Session Configuration Constants
 */

/**
 * Maximum number of identity sessions per user
 * When limit is reached, oldest session is automatically removed
 */
export const MAX_IDENTITY_SESSIONS_PER_USER = 5;

/**
 * Session idle timeout (milliseconds)
 * Sessions inactive for this duration are considered expired
 */
export const SESSION_IDLE_TIMEOUT_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Session absolute timeout (seconds)
 * Maximum session lifetime regardless of activity
 * Used as Redis TTL
 */
export const SESSION_ABSOLUTE_TIMEOUT_SECONDS = 14 * 24 * 60 * 60; // 14 days

/**
 * Session activity update throttle (seconds)
 * Minimum time between lastActivityAt updates
 */
export const SESSION_ACTIVITY_THROTTLE_SECONDS = 120; // 2 minutes

/**
 * Service name for session origin identification
 */
export const SERVICE_NAME = 'api';

/**
 * Redis Key Patterns
 */
export const REDIS_KEYS = {
  // Identity session storage
  identitySession: (sessionId: string) => `identity-session:${sessionId}`,

  // Tenant session storage
  tenantSession: (sessionId: string) => `tenant-session:${sessionId}`,

  // Secondary index: all identity sessions for a user
  userIdentitySessions: (userId: string) => `user:identity-sessions:${userId}`,

  // Secondary index: all tenant sessions for a user in a tenant
  userTenantSessions: (userId: string, tenantId: string) =>
    `user:tenant-sessions:${userId}:${tenantId}`,

  // Activity throttle key (TTL-based)
  sessionActivityThrottle: (sessionId: string) =>
    `session-activity-throttle:${sessionId}`,
} as const;

/**
 * Lua script for atomic session limit enforcement
 * Ensures race-condition-free session creation with automatic cleanup
 *
 * KEYS[1]: user:identity-sessions:{userId} (SET)
 * ARGV[1]: new session ID
 * ARGV[2]: max sessions (5)
 * ARGV[3]: identity-session: prefix
 *
 * Returns: "ok" if successful
 */
export const LUA_ENFORCE_SESSION_LIMIT = `
local userSessionsKey = KEYS[1]
local newSessionId = ARGV[1]
local maxSessions = tonumber(ARGV[2])
local sessionKeyPrefix = ARGV[3]

-- Get current session count
local currentCount = redis.call('SCARD', userSessionsKey)

-- If at limit, find and delete oldest session
if currentCount >= maxSessions then
  -- Get all session IDs
  local sessionIds = redis.call('SMEMBERS', userSessionsKey)

  -- Find oldest session by reading createdAt timestamp
  local oldestSessionId = nil
  local oldestTimestamp = nil

  for _, sessionId in ipairs(sessionIds) do
    local sessionKey = sessionKeyPrefix .. sessionId
    local createdAt = redis.call('HGET', sessionKey, 'createdAt')

    if createdAt then
      if not oldestTimestamp or createdAt < oldestTimestamp then
        oldestTimestamp = createdAt
        oldestSessionId = sessionId
      end
    end
  end

  -- Delete oldest session if found
  if oldestSessionId then
    -- Get session data before deletion (need userId for cleanup)
    local oldestSessionKey = sessionKeyPrefix .. oldestSessionId
    local sessionData = redis.call('HGETALL', oldestSessionKey)
    local userId = nil

    -- Extract userId from session data
    for i = 1, #sessionData, 2 do
      if sessionData[i] == 'userId' then
        userId = sessionData[i + 1]
        break
      end
    end

    -- Delete linked tenant sessions AND their secondary indexes
    for i = 1, #sessionData, 2 do
      if sessionData[i] == 'activeTenantSessionIds' then
        local tenantSessionIds = cjson.decode(sessionData[i + 1])
        for _, tenantSessionId in ipairs(tenantSessionIds) do
          local tenantSessionKey = 'tenant-session:' .. tenantSessionId

          -- Get tenant session data to find tenantId for index cleanup
          local tenantData = redis.call('HGETALL', tenantSessionKey)
          local tenantId = nil

          for j = 1, #tenantData, 2 do
            if tenantData[j] == 'tenantId' then
              tenantId = tenantData[j + 1]
              break
            end
          end

          -- Delete tenant session
          redis.call('DEL', tenantSessionKey)

          -- Clean up secondary index: user:tenant-sessions:{userId}:{tenantId}
          if userId and tenantId then
            redis.call('SREM', 'user:tenant-sessions:' .. userId .. ':' .. tenantId, tenantSessionId)
          end

          -- Delete tenant session throttle key
          redis.call('DEL', 'session-activity-throttle:' .. tenantSessionId)
        end
        break
      end
    end

    -- Delete identity session
    redis.call('DEL', oldestSessionKey)

    -- Remove from user identity sessions index
    redis.call('SREM', userSessionsKey, oldestSessionId)

    -- Delete identity session throttle key
    redis.call('DEL', 'session-activity-throttle:' .. oldestSessionId)
  end
end

-- Add new session to index
redis.call('SADD', userSessionsKey, newSessionId)

return "ok"
`;

/**
 * Backward compatibility period (days)
 * Support tokens without sessionId for this duration after deployment
 */
export const BACKWARD_COMPATIBILITY_DAYS = 28;

/**
 * Deployment date for backward compatibility tracking
 * Update this when deploying session management feature
 * Format: YYYY-MM-DD
 */
export const SESSION_FEATURE_DEPLOYMENT_DATE = '2026-02-09';
