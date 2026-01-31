import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { FastifyRequest } from 'fastify';
import { Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

// Custom extractor to get refresh token from HTTP-only cookie
const cookieExtractor = (req: FastifyRequest): string | null => {
  return req?.cookies?.refreshToken || null;
};

export const JWT_REFRESH_STRATEGY = 'JWT_REFRESH_STRATEGY';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_REFRESH_STRATEGY,
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.refreshSecret') || 'fallback-secret',
      passReqToCallback: true,
    });
  }

  validate(req: FastifyRequest, payload: JwtPayload) {
    // Ensure it's a refresh token
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const refreshToken = req.cookies?.refreshToken;

    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}
