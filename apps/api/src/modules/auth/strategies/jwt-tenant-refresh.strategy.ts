import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { I18nContext } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { TENANT_REFRESH_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
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
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_TOKEN_TYPE) ?? 'Invalid token type',
      );
    }

    const refreshToken = cookieExtractor(req);
    if (!refreshToken) {
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
