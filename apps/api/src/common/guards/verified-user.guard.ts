import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import type { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { UserRepository } from 'src/repositories/users/user.repository';
import { CommonI18n } from '../constants/i18n.constants';

/**
 * Verified User Guard
 *
 * Ensures the authenticated user (via identity token) has verified their email.
 * Reads `is_verified` from the database: the JWT claim can be stale or was issued before
 * verification was enforced at login, so it is never trusted for this check.
 *
 * Usage (the module must provide UserRepository):
 * ```typescript
 * @Post()
 * @AuthOptions({ identity: true })
 * @UseGuards(VerifiedUserGuard)
 * async createTenantForUser(...) { ... }
 * ```
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  constructor(private readonly userRepository: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      auth?: { identity?: AuthenticatedIdentityUser };
    }>();
    const userId = request.auth?.identity?.userId;
    const user = userId ? await this.userRepository.findById(userId) : null;

    if (!user?.is_verified) {
      const i18n = I18nContext.current();
      throw new ForbiddenException(
        i18n?.t(CommonI18n.errors.EMAIL_VERIFICATION_REQUIRED) ??
          'Email verification required',
      );
    }
    return true;
  }
}
