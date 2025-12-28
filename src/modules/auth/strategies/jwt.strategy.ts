import { Injectable, HttpStatus } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { BusinessException } from 'src/common/exceptions/business.exception';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
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
      throw new BusinessException(
        'auth.errors.tokenInvalidType',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Return user information to be attached to request.user
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
      isSystemAdmin: payload.isSystemAdmin || false,
    };
  }
}
