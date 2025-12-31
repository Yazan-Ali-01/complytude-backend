import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { I18nService, I18nContext } from 'nestjs-i18n';

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
  constructor(
    private configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
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
      throw new UnauthorizedException(
        this.i18n.t('auth.errors.tokenInvalidType', {
          lang: I18nContext.current()?.lang,
        }),
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
