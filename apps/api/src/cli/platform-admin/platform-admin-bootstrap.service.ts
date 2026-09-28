import { AuditService } from '@lib/audit';
import { DatabaseService, type QueryOptions } from '@lib/database';
import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { SessionInvalidationService } from 'src/modules/auth/services/session-invalidation.service';
import { EmailService } from 'src/modules/email/email.service';
import { User } from 'src/modules/users/entities/user.entity';
import { UserRepository } from 'src/repositories/users/user.repository';

/** How long the emailed set-password link stays valid. */
export const SET_PASSWORD_LINK_TTL_HOURS = 24;

export const PLATFORM_ROLE_GRANTED_AUDIT_ACTION = 'PLATFORM_ROLE_GRANTED';

export interface GrantPlatformRoleResult {
  userId: string;
  accountCreated: boolean;
  previousRole: string | null;
  roleChanged: boolean;
  setPasswordLinkSent: boolean;
}

/** A refusal the operator must act on; the CLI prints the message and exits non-zero. */
export class PlatformAdminBootstrapError extends Error {}

/**
 * Grants a platform role from the command line. The only way to create a platform admin: there is
 * no password in the repo, and a new account's only way in is the set-password link emailed to it.
 */
@Injectable()
export class PlatformAdminBootstrapService {
  private readonly logger = new Logger(PlatformAdminBootstrapService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly auditService: AuditService,
  ) {}

  async grant(
    rawEmail: string,
    role: SystemPlatformRole,
  ): Promise<GrantPlatformRoleResult> {
    const email = rawEmail.trim().toLowerCase();
    const existing = await this.userRepository.findByEmailRow(email);

    // An unverified account may belong to someone who only typed this address (and holds its
    // password), so it is never promoted.
    if (existing && !existing.is_verified) {
      throw new PlatformAdminBootstrapError(
        `The account for ${email} has not verified its email, so it may not belong to the owner of that mailbox. ` +
          'Have the owner verify it, or delete the account, then run this again.',
      );
    }

    const { user, accountCreated, setPasswordToken } =
      await this.databaseService.transaction(async (client) => {
        let user: User;
        let accountCreated = false;
        if (existing) {
          user =
            existing.platform_role_key === role
              ? existing
              : await this.userRepository.update(
                  existing.id,
                  { platform_role_key: role, updated_at: new Date() },
                  { client },
                );
        } else {
          // Verified without a password: whoever controls the mailbox sets one through the link.
          user = await this.userRepository.create(
            {
              email,
              password_hash: null,
              is_verified: true,
              platform_role_key: role,
              auth_provider: 'email',
            },
            { client },
          );
          accountCreated = true;
        }
        const setPasswordToken =
          user.password_hash === null
            ? await this.createSetPasswordToken(user.id, { client })
            : null;
        return { user, accountCreated, setPasswordToken };
      });

    const previousRole = existing?.platform_role_key ?? null;
    const roleChanged = previousRole !== role;

    // Identity tokens carry the platform role; end the old sessions so the new role applies cleanly.
    if (existing && roleChanged) {
      await this.sessionInvalidationService.invalidateAllUserSessions(user.id);
    }

    if (setPasswordToken) {
      await this.emailService.sendPasswordResetEmail(email, setPasswordToken);
    }

    const result: GrantPlatformRoleResult = {
      userId: user.id,
      accountCreated,
      previousRole,
      roleChanged,
      setPasswordLinkSent: setPasswordToken !== null,
    };

    if (roleChanged || setPasswordToken) {
      await this.auditService.logSystemEvent({
        action: PLATFORM_ROLE_GRANTED_AUDIT_ACTION,
        resourceType: 'users',
        resourceId: user.id,
        details: {
          role,
          previousRole,
          accountCreated,
          setPasswordLinkSent: result.setPasswordLinkSent,
          via: 'cli',
          operator: this.operator(),
        },
      });
    }

    this.logger.log(
      `Platform role ${role} for user ${user.id}: ` +
        `created=${accountCreated} changed=${roleChanged} setPasswordLinkSent=${result.setPasswordLinkSent}`,
    );
    return result;
  }

  /** Stores a sha256 of a single-use set-password token and returns the raw token to email. */
  private async createSetPasswordToken(
    userId: string,
    options: QueryOptions,
  ): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.userRepository.createPasswordReset(
      {
        userId,
        token: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(
          Date.now() + SET_PASSWORD_LINK_TTL_HOURS * 60 * 60 * 1000,
        ),
      },
      options,
    );
    return token;
  }

  private operator(): string {
    let user = 'unknown';
    try {
      user = userInfo().username;
    } catch {
      // No passwd entry (some containers)
    }
    return `${user}@${hostname()}`;
  }
}
