import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { IDENTITY_REFRESH_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
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
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.identityRefreshSecret') ||
        'fallback-secret',
      passReqToCallback: true,
    });
  }

  validate(
    req: FastifyRequest,
    payload: IdentityRefreshPayload,
  ): AuthenticatedIdentityRefreshUser {
    // Ensure it's an identity refresh token
    if (payload.type !== IDENTITY_REFRESH_PAYLOAD_TYPE) {
      throw new UnauthorizedException('Invalid token type');
    }

    const refreshToken = cookieExtractor(req);
    if (!refreshToken) {
      throw new UnauthorizedException(
        'Invalid or missing identity refresh token',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}
