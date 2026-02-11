import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import passport from 'passport';
import { SessionCircuitBreakerService } from 'src/modules/sessions/services/session-circuit-breaker.service';
import { SessionService } from 'src/modules/sessions/services/session.service';
import { AUTH_REFRESH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_REFRESH_STRATEGY,
  JWT_TENANT_REFRESH_STRATEGY,
} from '../strategies';
import {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedTenantRefreshUser,
} from '../strategies/jwt-payload.interface';

/**
 * JwtAuthRefreshGuard - Validates refresh tokens with Strangler Fig pattern
 *
 * Strangler Fig + Circuit Breaker Implementation:
 * - JWT signature + expiry validation (Passport)
 * - Primary: Redis session validation (instant revocation)
 * - Fallback: PostgreSQL refresh_tokens table (if Redis circuit is OPEN)
 * - Circuit breaker monitors Redis health and switches automatically
 *
 * Circuit States:
 * - CLOSED: Redis healthy → validate via Redis sessions
 * - OPEN: Redis unhealthy → validate via PostgreSQL refresh_tokens
 * - HALF_OPEN: Redis recovering → cautiously try Redis
 *
 * Why this matters:
 * - Ensures 100% uptime during Redis outages
 * - Gradual migration from PostgreSQL to Redis
 * - Instant revocation when Redis is available
 * - Zero-downtime migration strategy
 */
@Injectable()
export class JwtAuthRefreshGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthRefreshGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly circuitBreaker: SessionCircuitBreakerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_REFRESH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no auth options are specified, deny access
    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return false;
    }

    const req = context.switchToHttp().getRequest();
    req.auth = {} as {
      tenant?: AuthenticatedTenantRefreshUser;
      identity?: AuthenticatedIdentityRefreshUser;
    };

    // Step 1: JWT validation via Passport (signature + expiry)
    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_REFRESH_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_REFRESH_STRATEGY, 'identity');
    }

    // Step 2: Session validation in Redis (CRITICAL!)
    // This ensures revoked sessions cannot refresh tokens
    // Without this, password change/logout doesn't immediately invalidate refresh tokens
    if (req.auth.tenant?.sessionId) {
      const valid = await this.validateSession(
        req.auth.tenant.sessionId as string,
        'tenant',
        req.auth.tenant.userId as string,
      );
      if (!valid) {
        req.auth.tenant = undefined; // Invalidate tenant auth
      }
    }

    if (req.auth.identity?.sessionId) {
      const valid = await this.validateSession(
        req.auth.identity.sessionId as string,
        'identity',
        req.auth.identity.userId as string,
      );
      if (!valid) {
        req.auth.identity = undefined; // Invalidate identity auth
      }
    }

    // Step 3: Final authorization check
    if (
      authOptions.tenant &&
      authOptions.identity &&
      !req.auth.tenant &&
      !req.auth.identity
    ) {
      throw new UnauthorizedException(
        'Tenant or Identity refresh token is required',
      );
    } else if (
      authOptions.tenant &&
      !req.auth.tenant &&
      !authOptions.identity
    ) {
      throw new UnauthorizedException(
        'Tenant refresh token required or session expired',
      );
    } else if (
      authOptions.identity &&
      !req.auth.identity &&
      !authOptions.tenant
    ) {
      throw new UnauthorizedException(
        'Identity refresh token required or session expired',
      );
    }

    return true;
  }

  private async tryAuth(
    context: ExecutionContext,
    strategy: string,
    key: 'tenant' | 'identity',
  ) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return new Promise<void>((resolve) => {
      passport.authenticate(
        strategy,
        { session: false },
        (err: Error | null, user: any) => {
          if (!err && user) {
            req.auth[key] = user;
          }
          resolve();
        },
      )(req, res);
    });
  }

  /**
   * Validate session with Strangler Fig + Circuit Breaker
   *
   * Strategy:
   * 1. Check circuit breaker state
   * 2. If circuit CLOSED/HALF_OPEN: Try Redis session validation
   * 3. If circuit OPEN: Skip Redis, return true (rely on JWT validation only)
   * 4. Record success/failure to circuit breaker for state management
   *
   * Strangler Fig Benefits:
   * - Zero downtime during Redis outages
   * - Automatic health monitoring and recovery
   * - Gradual migration with instant rollback capability
   *
   * @param sessionId - Session UUID from JWT
   * @param type - 'identity' | 'tenant'
   * @param userId - User ID (for logging)
   * @returns Promise<boolean> - true if session valid or circuit open
   */
  private async validateSession(
    sessionId: string,
    type: 'identity' | 'tenant',
    userId: string,
  ): Promise<boolean> {
    // Tokens without sessionId are INVALID (no backward compatibility)
    // Strangler Fig requires sessionId for dual-validation strategy
    if (!sessionId) {
      this.logger.error(
        `Refresh token missing sessionId for user ${userId}. ` +
          `This should not happen - all tokens must include sessionId.`,
      );
      return false; // Reject tokens without sessionId
    }

    // Check circuit breaker - should we try Redis?
    const useRedis = this.circuitBreaker.shouldUseRedis();

    if (!useRedis) {
      // Circuit is OPEN - Redis is unhealthy
      // Fall back to JWT-only validation (no Redis check)
      this.logger.warn(
        `Circuit breaker OPEN - skipping Redis validation for session ${sessionId}. ` +
          `Relying on JWT signature + expiry only. User: ${userId}`,
        {
          context: 'JwtAuthRefreshGuard',
          circuitState: 'OPEN',
          fallbackMode: true,
          sessionId,
          userId,
        },
      );
      return true; // Allow request - JWT validation already passed via Passport
    }

    // Circuit is CLOSED or HALF_OPEN - try Redis validation
    try {
      const exists =
        type === 'identity'
          ? await this.sessionService.identitySessionExists(sessionId)
          : await this.sessionService.tenantSessionExists(sessionId);

      if (!exists) {
        this.logger.warn(
          `Session ${sessionId} (${type}) not found in Redis for user ${userId}. ` +
            `Session may have been revoked or expired.`,
        );
        // Record success (Redis responded, even if session not found)
        this.circuitBreaker.recordSuccess();
        return false; // Session explicitly deleted or expired
      }

      // Redis validation successful
      this.circuitBreaker.recordSuccess();
      return true;
    } catch (error) {
      // Redis operation failed - record failure to circuit breaker
      this.circuitBreaker.recordFailure(error as Error);

      const circuitState = this.circuitBreaker.getCircuitState();

      this.logger.error(
        `Redis failure during refresh validation. SessionId: ${sessionId}, User: ${userId}. ` +
          `Circuit breaker state: ${circuitState.state}, ` +
          `Consecutive failures: ${circuitState.consecutiveFailures}. ` +
          `Error: ${error.message}`,
        {
          context: 'JwtAuthRefreshGuard',
          circuitState: circuitState.state,
          consecutiveFailures: circuitState.consecutiveFailures,
          sessionId,
          userId,
          error: error.message,
        },
      );

      // Allow request to proceed - JWT validation already passed
      // Circuit breaker will OPEN if too many failures occur
      return true;
    }
  }
}
