import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt.strategy';
import { I18nService, I18nContext } from 'nestjs-i18n';
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
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
      throw new UnauthorizedException(
        this.i18n.t('auth.errors.tokenInvalidType', {
          lang: I18nContext.current()?.lang,
        }),
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
