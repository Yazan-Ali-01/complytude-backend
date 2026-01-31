import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { IdentityPayload } from './jwt-payload.interface';

// Custom extractor to get identity token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.identityToken || null;
};

export const JWT_IDENTITY_STRATEGY = 'JWT_IDENTITY_STRATEGY';

@Injectable()
export class JwtIdentityStrategy extends PassportStrategy(
  Strategy,
  JWT_IDENTITY_STRATEGY,
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.identitySecret') || 'fallback-secret',
    });
  }

  validate(payload: IdentityPayload) {
    // Ensure it's an access token
    if (payload.type !== 'identity') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Return user information to be attached to request.user
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
