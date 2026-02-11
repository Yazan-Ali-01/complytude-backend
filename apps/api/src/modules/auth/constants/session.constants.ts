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

// SERVICE_NAME constant removed - YAGNI principle applied
//
// Rationale: Only 'api' service creates user sessions currently
// Workers (worker-ai, worker-ingestion) don't have authentication
// Mobile apps don't exist yet
//
// When to add back:
// - When mobile apps are actually in development (not speculation)
// - When workers need to create user sessions (unlikely)
// - When deploying multiple API instances need differentiation
//
// How to add back (when needed):
// 1. Add serviceName: string field to IdentitySession interface
// 2. Add SERVICE_NAME env variable to env.schema.ts
// 3. Pass serviceName in createIdentitySession()
// 4. Estimated time: 30 minutes

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
 * IMPORTANT: Redis keyPrefix (e.g., 'complytude:') is NOT automatically applied
 * inside Lua scripts. We must manually include it in all key constructions.
 *
 * KEYS[1]: user:identity-sessions:{userId} (SET) - ioredis auto-prefixes this
 * ARGV[1]: new session ID
 * ARGV[2]: max sessions (5)
 * ARGV[3]: Redis keyPrefix (e.g., 'complytude:')
 *
 * Returns: "ok" if successful
 */
export const LUA_ENFORCE_SESSION_LIMIT = `
local userSessionsKey = KEYS[1]
local newSessionId = ARGV[1]
local maxSessions = tonumber(ARGV[2])
local keyPrefix = ARGV[3]

-- Construct key prefixes with Redis keyPrefix included
local identitySessionPrefix = keyPrefix .. 'identity-session:'
local tenantSessionPrefix = keyPrefix .. 'tenant-session:'
local userTenantSessionsPrefix = keyPrefix .. 'user:tenant-sessions:'
local activityThrottlePrefix = keyPrefix .. 'session-activity-throttle:'

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
    local sessionKey = identitySessionPrefix .. sessionId
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
    local oldestSessionKey = identitySessionPrefix .. oldestSessionId
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
          local tenantSessionKey = tenantSessionPrefix .. tenantSessionId

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
          -- Note: KEYS passed to eval() are auto-prefixed, but keys we construct aren't
          if userId and tenantId then
            redis.call('SREM', userTenantSessionsPrefix .. userId .. ':' .. tenantId, tenantSessionId)
          end

          -- Delete tenant session throttle key
          redis.call('DEL', activityThrottlePrefix .. tenantSessionId)
        end
        break
      end
    end

    -- Delete identity session
    redis.call('DEL', oldestSessionKey)

    -- Remove from user identity sessions index
    redis.call('SREM', userSessionsKey, oldestSessionId)

    -- Delete identity session throttle key
    redis.call('DEL', activityThrottlePrefix .. oldestSessionId)
  end
end

-- Add new session to index
redis.call('SADD', userSessionsKey, newSessionId)

return "ok"
`;

/**
 * Circuit Breaker Configuration
 * Used for Strangler Fig pattern migration from PostgreSQL to Redis
 */
export const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 5, // Open circuit after 5 consecutive failures
  SUCCESS_THRESHOLD: 3, // Close circuit after 3 consecutive successes
  HEALTH_CHECK_INTERVAL_MS: 10000, // Check health every 10 seconds when open
} as const;

/**
 * Migration deployment date
 * Track when Strangler Fig pattern was activated
 * Format: YYYY-MM-DD
 */
export const STRANGLER_FIG_DEPLOYMENT_DATE = '2026-02-10';
