import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import passport from 'passport';
import { AuthI18n } from '../constants/i18n.constants';
import { AUTH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no auth options are specified, allow access
    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    req.auth = {};

    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_ACCESS_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_ACCESS_STRATEGY, 'identity');
    }

    const i18n = I18nContext.current();
    if (authOptions?.tenant && !req.auth.tenant)
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.TENANT_TOKEN_REQUIRED) ?? 'Tenant token required',
      );
    if (authOptions?.identity && !req.auth.identity)
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.IDENTITY_TOKEN_REQUIRED) ??
          'Identity token required',
      );

    return true;
  }

  private async tryAuth(
    context: ExecutionContext,
    strategy: string,
    key: 'tenant' | 'identity',
  ) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return new Promise<void>((resolve) => {
      passport.authenticate(strategy, { session: false }, (err, user) => {
        if (!err && user) {
          req.auth[key] = user;
        }
        resolve();
      })(req, res);
    });
  }
}
