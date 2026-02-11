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
import { AUTH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';
import {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../strategies/jwt-payload.interface';

/**
 * JwtAuthGuard with Strangler Fig + Circuit Breaker
 *
 * Strangler Fig Implementation:
 * - JWT signature + expiry validation (Passport)
 * - Primary: Redis session validation (instant revocation)
 * - Fallback: Skip Redis if circuit breaker is OPEN (rely on JWT only)
 * - Circuit breaker monitors Redis health and switches automatically
 * - Activity tracking with throttling (fire-and-forget)
 *
 * Flow:
 * 1. Passport validates JWT signature + expiry
 * 2. Extract sessionId from validated payload
 * 3. Check circuit breaker state
 * 4. If circuit CLOSED: Validate session in Redis
 * 5. If circuit OPEN: Skip Redis, rely on JWT validation
 * 6. Update session activity (throttled, fire-and-forget)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly circuitBreaker: SessionCircuitBreakerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no auth options are specified, allow access
    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    req.auth = {} as {
      tenant?: AuthenticatedTenantUser;
      identity?: AuthenticatedIdentityUser;
    };

    // JWT validation via Passport
    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_ACCESS_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_ACCESS_STRATEGY, 'identity');
    }

    // Session validation in Redis (with graceful degradation)
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

    // Final authorization check
    if (authOptions?.tenant && !req.auth.tenant)
      throw new UnauthorizedException(
        'Tenant token required or session expired',
      );
    if (authOptions?.identity && !req.auth.identity)
      throw new UnauthorizedException(
        'Identity token required or session expired',
      );

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
   * 3. If circuit OPEN: Skip Redis, rely on JWT validation only
   * 4. Record success/failure to circuit breaker
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
    if (!sessionId) {
      this.logger.error(
        `Access token missing sessionId for user ${userId}. ` +
          `This should not happen - all tokens must include sessionId.`,
      );
      return false; // Reject tokens without sessionId
    }

    // Check circuit breaker - should we try Redis?
    const useRedis = this.circuitBreaker.shouldUseRedis();

    if (!useRedis) {
      // Circuit is OPEN - Redis is unhealthy
      // Fall back to JWT-only validation
      this.logger.warn(
        `Circuit breaker OPEN - skipping Redis validation for session ${sessionId}. ` +
          `Relying on JWT signature + expiry only. User: ${userId}`,
        {
          context: 'JwtAuthGuard',
          circuitState: 'OPEN',
          fallbackMode: true,
          sessionId,
          userId,
        },
      );
      return true; // Allow request - JWT validation already passed
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
        // Redis responded successfully (session just doesn't exist)
        this.circuitBreaker.recordSuccess();
        return false; // Session explicitly deleted or expired
      }

      // Redis validation successful - update activity
      this.circuitBreaker.recordSuccess();
      void this.sessionService.touchActivity(sessionId, type);

      return true;
    } catch (error) {
      // Redis operation failed - record failure to circuit breaker
      this.circuitBreaker.recordFailure(error as Error);

      const circuitState = this.circuitBreaker.getCircuitState();

      this.logger.error(
        `Redis failure during session validation. SessionId: ${sessionId}, User: ${userId}. ` +
          `Circuit breaker state: ${circuitState.state}, ` +
          `Consecutive failures: ${circuitState.consecutiveFailures}. ` +
          `Error: ${error.message}`,
        {
          context: 'JwtAuthGuard',
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
