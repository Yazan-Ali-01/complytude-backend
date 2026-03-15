import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { CommonI18n } from '../constants/i18n.constants';

/**
 * Verified User Guard
 *
 * Ensures the authenticated user (via identity token) has verified their email.
 * Checks the isVerified flag in the JWT payload (no DB call needed).
 *
 * Usage:
 * ```typescript
 * @Post()
 * @AuthOptions({ identity: true })
 * @UseGuards(VerifiedUserGuard)
 * async createTenantForUser(...) { ... }
 * ```
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.auth?.identity as
      | AuthenticatedIdentityUser
      | undefined;

    if (!user?.isVerified) {
      const i18n = I18nContext.current();
      throw new ForbiddenException(
        i18n?.t(CommonI18n.errors.EMAIL_VERIFICATION_REQUIRED) ??
          'Email verification required',
      );
    }
    return true;
  }
}
