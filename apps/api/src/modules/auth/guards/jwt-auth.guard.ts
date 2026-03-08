import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18n, I18nService } from 'nestjs-i18n';
import passport from 'passport';
import { CommonI18n } from '../../../common/constants';
import { AUTH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_ACCESS_STRATEGY,
  JWT_TENANT_ACCESS_STRATEGY,
} from '../strategies';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @I18n() private readonly i18n: I18nService,
  ) {}

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

    if (authOptions?.tenant && !req.auth.tenant)
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ?? 'Tenant token required',
      );
    if (authOptions?.identity && !req.auth.identity)
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
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
