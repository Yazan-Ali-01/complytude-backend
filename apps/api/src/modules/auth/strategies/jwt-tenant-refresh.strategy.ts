import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18n, I18nService } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { TENANT_REFRESH_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { CommonI18n } from '../../../common/constants';
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
  constructor(
    private configService: ConfigService,
    @I18n() private readonly i18n: I18nService,
  ) {
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
    if (payload.type !== TENANT_REFRESH_PAYLOAD_TYPE) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ?? 'Invalid token type',
      );
    }

    const refreshToken = cookieExtractor(req);
    if (!refreshToken) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
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
