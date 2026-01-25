import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { TempAuthPayload } from './jwt-payload.interface';

// Custom extractor to get temp auth token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.tempAuthToken || null;
};

@Injectable()
export class JwtTempAuthStrategy extends PassportStrategy(
  Strategy,
  'jwt-temp-auth',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.tempAuthSecret') || 'fallback-secret',
    });
  }

  validate(payload: TempAuthPayload) {
    // Ensure it's an access token
    if (payload.type !== 'temp-auth') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Return user information to be attached to request.user
    return {
      userId: payload.sub,
      email: payload.email,
    };
  }
}
