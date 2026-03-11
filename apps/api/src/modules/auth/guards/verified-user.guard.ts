import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { UserRepository } from 'src/repositories/users/user.repository';
import { AuthI18n } from '../constants/i18n.constants';
import type { AuthenticatedIdentityUser } from '../strategies';

/**
 * Verified User Guard
 *
 * Ensures the authenticated user (via identity token) has verified their email.
 * Performs real-time database check to prevent use of stale tokens.
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  constructor(private readonly userRepository: UserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const identityUser = request.auth?.identity as
      | AuthenticatedIdentityUser
      | undefined;

    if (!identityUser) {
      throw new ForbiddenException(
        'Identity authentication required for this operation',
      );
    }

    // Real-time verification check
    const user = await this.userRepository.findById(identityUser.userId);

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (!user.is_verified) {
      const i18n = I18nContext.current();
      throw new ForbiddenException(
        i18n?.t(AuthI18n.errors.EMAIL_NOT_VERIFIED) ??
          'Email verification required',
      );
    }

    return true;
  }
}
