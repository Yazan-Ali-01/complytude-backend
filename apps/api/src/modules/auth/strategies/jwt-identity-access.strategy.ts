import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { IDENTITY_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { AuthI18n } from '../constants/i18n.constants';
import {
  AuthenticatedIdentityUser,
  IDENTITY_PAYLOAD_TYPE,
  IdentityPayload,
} from './jwt-payload.interface';

// Custom extractor to get identity token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.[IDENTITY_TOKEN_COOKIE_NAME] ?? null;
};

export const JWT_IDENTITY_ACCESS_STRATEGY = 'JWT_IDENTITY_ACCESS_STRATEGY';

@Injectable()
export class JwtIdentityAccessStrategy extends PassportStrategy(
  Strategy,
  JWT_IDENTITY_ACCESS_STRATEGY,
) {
  private readonly logger = new Logger(JwtIdentityAccessStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.identitySecret') || 'fallback-secret',
    });
  }

  validate(payload: IdentityPayload): AuthenticatedIdentityUser {
    if (payload.type !== IDENTITY_PAYLOAD_TYPE) {
      this.logger.warn(
        `Invalid token type: expected ${String(IDENTITY_PAYLOAD_TYPE)}, got ${String(payload.type)}`,
      );
      const i18n = I18nContext.current();
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_TOKEN_TYPE) ?? 'Invalid token type',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      isVerified: payload.isVerified ?? false,
      platformRole: payload.platformRole ?? null,
      sessionId: payload.sessionId ?? '',
    };
  }
}
