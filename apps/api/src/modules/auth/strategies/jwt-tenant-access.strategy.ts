import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18n, I18nService } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { TENANT_ACCESS_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { CommonI18n } from '../../../common/constants';
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
  constructor(
    private configService: ConfigService,
    @I18n() private readonly i18n: I18nService,
  ) {
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
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ?? 'Invalid token type',
      );
    }

    // Return user information to be attached to request.auth.tenant
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
