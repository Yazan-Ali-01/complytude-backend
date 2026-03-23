import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { TENANT_REFRESH_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { AuthI18n } from '../constants/i18n.constants';
import {
  AuthenticatedTenantRefreshUser,
  TENANT_REFRESH_PAYLOAD_TYPE,
  TenantRefreshPayload,
} from './jwt-payload.interface';

// Custom extractor to get tenant refresh token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.[TENANT_REFRESH_TOKEN_COOKIE_NAME] ?? null;
};

export const JWT_TENANT_REFRESH_STRATEGY = 'JWT_TENANT_REFRESH_STRATEGY';

@Injectable()
export class JwtTenantRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_TENANT_REFRESH_STRATEGY,
) {
  private readonly logger = new Logger(JwtTenantRefreshStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.refreshSecret') || 'fallback-secret',
      passReqToCallback: true,
    });
  }

  validate(
    req: FastifyRequest,
    payload: TenantRefreshPayload,
  ): AuthenticatedTenantRefreshUser {
    // Ensure it's a tenant refresh token
    const i18n = I18nContext.current();
    if (payload.type !== TENANT_REFRESH_PAYLOAD_TYPE) {
      this.logger.warn(
        `Invalid token type: expected ${String(TENANT_REFRESH_PAYLOAD_TYPE)}, got ${String(payload.type)}`,
      );
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_TOKEN_TYPE) ?? 'Invalid token type',
      );
    }

    const refreshToken = cookieExtractor(req);
    if (!refreshToken) {
      this.logger.warn('Invalid or missing tenant refresh token');
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_OR_MISSING_TENANT_REFRESH_TOKEN) ??
          'Invalid or missing tenant refresh token',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      refreshToken,
    };
  }
}
