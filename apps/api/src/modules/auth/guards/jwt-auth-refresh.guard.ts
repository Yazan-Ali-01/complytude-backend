import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import passport from 'passport';
import { AUTH_REFRESH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import { SessionService } from '../services/session.service';
import {
  JWT_IDENTITY_REFRESH_STRATEGY,
  JWT_TENANT_REFRESH_STRATEGY,
} from '../strategies';
import {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedTenantRefreshUser,
} from '../strategies/jwt-payload.interface';

/**
 * JwtAuthRefreshGuard - Validates refresh tokens with session checking
 *
 * Features:
 * - JWT signature + expiry validation (Passport)
 * - Session existence check in Redis (CRITICAL for instant revocation)
 * - Graceful degradation if Redis is unavailable
 * - Backward compatibility for tokens without sessionId
 *
 * Why session validation is critical:
 * - Without it, revoked sessions can still refresh tokens
 * - Example: User changes password → session deleted from Redis
 *   → Old refresh token still works WITHOUT this check
 * - This closes the security vulnerability
 */
@Injectable()
export class JwtAuthRefreshGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthRefreshGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
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
   * Validate session exists in Redis
   * Implements graceful degradation and backward compatibility
   *
   * This is identical to JwtAuthGuard.validateSession() - consolidation ensures
   * both access and refresh tokens validate sessions consistently.
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
        `Legacy refresh token detected for user ${userId} (no sessionId). ` +
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
          `Refresh token session ${sessionId} (${type}) not found for user ${userId}. ` +
            `Session may have been revoked or expired.`,
        );
        return false; // Session explicitly deleted or expired
      }

      return true;
    } catch (error) {
      // Redis failure - graceful degradation to JWT-only validation
      this.logger.warn(
        `Redis unavailable during refresh - falling back to JWT-only validation. ` +
          `SessionId: ${sessionId}, Type: ${type}, User: ${userId}. ` +
          `Error: ${error.message}`,
        {
          context: 'JwtAuthRefreshGuard',
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
