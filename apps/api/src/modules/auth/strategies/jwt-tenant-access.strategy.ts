import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { TENANT_ACCESS_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { AuthI18n } from '../constants/i18n.constants';
import {
  AuthenticatedTenantUser,
  TENANT_PAYLOAD_TYPE,
  TenantPayload,
} from './jwt-payload.interface';

// Custom extractor to get tenant access token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.[TENANT_ACCESS_TOKEN_COOKIE_NAME] ?? null;
};

export const JWT_TENANT_ACCESS_STRATEGY = 'JWT_TENANT_ACCESS_STRATEGY';

@Injectable()
export class JwtTenantAccessStrategy extends PassportStrategy(
  Strategy,
  JWT_TENANT_ACCESS_STRATEGY,
) {
  private readonly logger = new Logger(JwtTenantAccessStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') || 'fallback-secret',
    });
  }

  validate(payload: TenantPayload): AuthenticatedTenantUser {
    // Ensure it's a tenant access token
    if (payload.type !== TENANT_PAYLOAD_TYPE) {
      this.logger.warn(
        `Invalid token type: expected ${String(TENANT_PAYLOAD_TYPE)}, got ${String(payload.type)}`,
      );
      const i18n = I18nContext.current();
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_TOKEN_TYPE) ?? 'Invalid token type',
      );
    }

    const i18n = I18nContext.current();
    if (!payload.sessionId?.trim()) {
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_REFRESH_TOKEN) ??
          'Session expired or invalid',
      );
    }

    // Return user information to be attached to request.auth.tenant
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  }
}
