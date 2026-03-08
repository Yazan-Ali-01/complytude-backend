import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { I18n, I18nService } from 'nestjs-i18n';
import { Strategy } from 'passport-jwt';
import { IDENTITY_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
import { CommonI18n } from '../../../common/constants';
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
  constructor(
    private configService: ConfigService,
    @I18n() private readonly i18n: I18nService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.identitySecret') || 'fallback-secret',
    });
  }

  validate(payload: IdentityPayload): AuthenticatedIdentityUser {
    // Ensure it's an identity access token
    if (payload.type !== IDENTITY_PAYLOAD_TYPE) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ?? 'Invalid token type',
      );
    }

    // Return user information to be attached to request.auth.identity
    return {
      userId: payload.sub,
      email: payload.email,
      platformRole: payload.platformRole ?? null,
    };
  }
}
