import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { IDENTITY_REFRESH_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { AuthI18n } from '../constants/i18n.constants';
import {
  AuthenticatedIdentityRefreshUser,
  IDENTITY_REFRESH_PAYLOAD_TYPE,
  IdentityRefreshPayload,
} from './jwt-payload.interface';

// Custom extractor to get identity refresh token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.[IDENTITY_REFRESH_TOKEN_COOKIE_NAME] ?? null;
};

export const JWT_IDENTITY_REFRESH_STRATEGY = 'JWT_IDENTITY_REFRESH_STRATEGY';

@Injectable()
export class JwtIdentityRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_IDENTITY_REFRESH_STRATEGY,
) {
  private readonly logger = new Logger(JwtIdentityRefreshStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>(
        'jwt.identityRefreshSecret',
      ),
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }

  validate(
    req: FastifyRequest,
    payload: IdentityRefreshPayload,
  ): AuthenticatedIdentityRefreshUser {
    const i18n = I18nContext.current();
    if (payload.type !== IDENTITY_REFRESH_PAYLOAD_TYPE) {
      this.logger.warn(
        `Invalid token type: expected ${String(IDENTITY_REFRESH_PAYLOAD_TYPE)}, got ${String(payload.type)}`,
      );
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_TOKEN_TYPE) ?? 'Invalid token type',
      );
    }

    const refreshToken = cookieExtractor(req);
    if (!refreshToken) {
      this.logger.warn('Invalid or missing identity refresh token');
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.INVALID_OR_MISSING_IDENTITY_REFRESH_TOKEN) ??
          'Invalid or missing identity refresh token',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId ?? '',
      refreshJti: payload.jti ?? '',
      refreshToken,
    };
  }
}
