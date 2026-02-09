import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { IDENTITY_TOKEN_COOKIE_NAME } from 'src/common/swagger/common';
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
  constructor(private configService: ConfigService) {
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
      throw new UnauthorizedException('Invalid token type');
    }

    // Return user information to be attached to request.auth.identity
    return {
      userId: payload.sub,
      email: payload.email,
      globalRoles: payload.globalRoles || [],
      sessionId: payload.sessionId, // Extract sessionId from JWT
    };
  }
}
