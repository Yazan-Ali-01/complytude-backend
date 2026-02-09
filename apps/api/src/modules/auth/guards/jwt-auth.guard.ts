import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import passport from 'passport';
import { AUTH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';
import { SessionService } from '../services/session.service';

/**
 * JwtAuthGuard with Session Validation
 *
 * Features:
 * - JWT signature + expiry validation (Passport)
 * - Session existence check in Redis
 * - Graceful degradation if Redis is unavailable
 * - Activity tracking with throttling
 * - Backward compatibility for tokens without sessionId (28 days)
 *
 * Flow:
 * 1. Passport validates JWT signature + expiry
 * 2. Extract sessionId from validated payload
 * 3. Check if session exists in Redis
 * 4. If Redis fails, fall back to JWT-only validation (log warning)
 * 5. Update session activity (throttled, fire-and-forget)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
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
    req.auth = {};

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
        req.auth.tenant.sessionId,
        'tenant',
        req.auth.tenant.userId,
      );
      if (!valid) {
        req.auth.tenant = undefined; // Invalidate tenant auth
      }
    }
    if (req.auth.identity?.sessionId) {
      const valid = await this.validateSession(
        req.auth.identity.sessionId,
        'identity',
        req.auth.identity.userId,
      );
      if (!valid) {
        req.auth.identity = undefined; // Invalidate identity auth
      }
    }

    // Final authorization check
    if (authOptions?.tenant && !req.auth.tenant)
      throw new UnauthorizedException('Tenant token required or session expired');
    if (authOptions?.identity && !req.auth.identity)
      throw new UnauthorizedException('Identity token required or session expired');

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
      passport.authenticate(strategy, { session: false }, (err, user) => {
        if (!err && user) {
          req.auth[key] = user;
        }
        resolve();
      })(req, res);
    });
  }

  /**
   * Validate session exists in Redis
   * Implements graceful degradation and backward compatibility
   *
   * @param sessionId - Session UUID from JWT
   * @param type - 'identity' | 'tenant'
   * @param userId - User ID (for logging)
   * @returns Promise<boolean> - true if session valid or degraded mode
   */
  private async validateSession(
    sessionId: string,
    type: 'identity' | 'tenant',
    userId: string,
  ): Promise<boolean> {
    // Backward compatibility: Allow tokens without sessionId (28 days)
    if (!sessionId) {
      this.logger.warn(
        `Legacy token detected for user ${userId} (no sessionId). ` +
        `Transitional support active until session feature deployment + 28 days.`,
      );
      return true; // Allow access during transition period
    }

    try {
      // Check if session exists in Redis
      const exists =
        type === 'identity'
          ? await this.sessionService.identitySessionExists(sessionId)
          : await this.sessionService.tenantSessionExists(sessionId);

      if (!exists) {
        this.logger.warn(
          `Session ${sessionId} (${type}) not found for user ${userId}. ` +
          `Session may have been revoked or expired.`,
        );
        return false; // Session explicitly deleted or expired
      }

      // Fire-and-forget activity update (throttled via TTL key)
      void this.sessionService.touchActivity(sessionId, type);

      return true;
    } catch (error) {
      // Redis failure - graceful degradation to JWT-only validation
      this.logger.warn(
        `Redis unavailable - falling back to JWT-only validation. ` +
        `SessionId: ${sessionId}, Type: ${type}, User: ${userId}. ` +
        `Error: ${error.message}`,
        {
          context: 'JwtAuthGuard',
          degradedMode: true,
          sessionId,
          userId,
          error: error.message,
        },
      );

      // JWT signature + expiry are still validated by Passport
      // Allow request to proceed - degraded but functional
      return true;
    }
  }
}
