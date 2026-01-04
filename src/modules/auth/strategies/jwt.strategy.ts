import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
  workspaceId: string;
  role: string;
  isSystemAdmin?: boolean;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') || 'fallback-secret',
    });
  }

  validate(payload: JwtPayload) {
    // Ensure it's an access token
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Return user information to be attached to request.user
    return {
      userId: payload.sub,
      email: payload.email,
      workspaceId: payload.workspaceId,
      role: payload.role,
      isSystemAdmin: payload.isSystemAdmin || false,
    };
  }
}
