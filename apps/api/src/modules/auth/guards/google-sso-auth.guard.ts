import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18nService } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import { GOOGLE_SSO_STRATEGY_NAME } from '../strategies/google-sso.strategy';
import {
  generateOAuthState,
  isOAuthCallback,
  shimFastifyReplyForPassport,
  verifyOAuthState,
} from '../utils/sso-csrf.util';

const STATE_COOKIE = 'sso_google_state';

@Injectable()
export class GoogleSsoAuthGuard extends AuthGuard(GOOGLE_SSO_STRATEGY_NAME) {
  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.configService.get<boolean>('sso.google.enabled')) {
      throw new ServiceUnavailableException(
        this.i18n.t(AuthI18n.errors.SSO_PROVIDER_NOT_CONFIGURED, {
          args: { provider: 'Google' },
        }),
      );
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    shimFastifyReplyForPassport(reply);

    if (isOAuthCallback(request)) {
      verifyOAuthState(request, reply, STATE_COOKIE);
    } else {
      const state = generateOAuthState(reply, STATE_COOKIE, isProduction);
      (request as FastifyRequest & { __oauthState?: string }).__oauthState =
        state;
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { __oauthState?: string }>();
    return request.__oauthState ? { state: request.__oauthState } : {};
  }
}
