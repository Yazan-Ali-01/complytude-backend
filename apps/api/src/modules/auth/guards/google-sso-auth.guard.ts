import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { I18nService } from 'nestjs-i18n';
import { AuthI18n } from '../constants/i18n.constants';
import { GOOGLE_SSO_STRATEGY_NAME } from '../strategies/google-sso.strategy';

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
    return super.canActivate(context);
  }
}
