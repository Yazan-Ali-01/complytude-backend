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
import { AUTH_REFRESH_OPTIONS_KEY } from '../decorators/auth-options.decorator';
import {
  JWT_IDENTITY_REFRESH_STRATEGY,
  JWT_TENANT_REFRESH_STRATEGY,
} from '../strategies';

@Injectable()
export class JwtAuthRefreshGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_REFRESH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If no auth options are specified, deny access
    if (
      !authOptions ||
      (authOptions.tenant === false && authOptions.identity === false)
    ) {
      return false;
    }

    const req = context.switchToHttp().getRequest();
    req.auth = {};

    if (authOptions.tenant) {
      await this.tryAuth(context, JWT_TENANT_REFRESH_STRATEGY, 'tenant');
    }
    if (authOptions.identity) {
      await this.tryAuth(context, JWT_IDENTITY_REFRESH_STRATEGY, 'identity');
    }

    // if both are required and one both are missing, deny access (for logout scenario)
    // if only one is required and is missing while the other is not required, deny access (single token refresh scenario)
    if (
      authOptions.tenant &&
      authOptions.identity &&
      !req.auth.tenant &&
      !req.auth.identity
    ) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Tenant or Identity refresh token is required',
      );
    } else if (
      authOptions.tenant &&
      !req.auth.tenant &&
      !authOptions.identity
    ) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Tenant refresh token required',
      );
    } else if (
      authOptions.identity &&
      !req.auth.identity &&
      !authOptions.tenant
    ) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Identity refresh token required',
      );
    }

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
