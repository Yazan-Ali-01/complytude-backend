import { Injectable, HttpStatus } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt.strategy';
import { BusinessException } from 'src/common/exceptions/business.exception';
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.refreshSecret') || 'fallback-secret',
      passReqToCallback: true,
    } as any);
  }

  async validate(req: any, payload: JwtPayload) {
    // Ensure it's a refresh token
    if (payload.type !== 'refresh') {
      throw new BusinessException(
        'auth.errors.tokenInvalidType',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const refreshToken = req.body?.['refreshToken'];

    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}
