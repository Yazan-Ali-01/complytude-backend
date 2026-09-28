import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { UserTenantWithUserRow } from 'src/repositories/users/interfaces/user-tenant.intefaces';
import { TenantRepository } from '../../repositories/tenants/tenant.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { SessionListResponseDto } from '../auth/dto/session-list-response.dto';
import type { TenantSessionItemDto } from '../auth/dto/session-response.dto';
import { SessionInvalidationService } from '../auth/services/session-invalidation.service';
import { SessionService } from '../auth/services/session.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { UsersI18n } from './constants/i18n.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserTenant } from './entities/user-tenant.entity';
import { User } from './entities/user.entity';

/** Role keys are plain strings (custom roles exist too) */
const TENANT_ADMIN: string = SystemTenantRole.TENANT_ADMIN;

/** Who is acting on a tenant's members. */
export interface MemberActor {
  userId: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly i18n: I18nService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly sessionService: SessionService,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  // ─── The signed-in user ───────────────────────────────────────

  async findById(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
          args: { userId },
        }),
      );
    }
    return user;
  }

  /** The tenants the user can switch into, with their names. */
  async getUserTenants(userId: string): Promise<UserTenant[]> {
    // Auth-flow context: a user may read their own memberships across tenants
    return this.userTenantRepository.getActiveUserTenants(userId, {
      isAuthflow: true,
    });
  }

  async getCurrentTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId, {
      tenant: { tenantId, schema: 'public' },
    });
    if (!tenant) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }
    return tenant;
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    if (
      updateProfileDto.firstName === undefined &&
      updateProfileDto.lastName === undefined
    ) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.NO_FIELDS_TO_UPDATE),
      );
    }

    await this.findById(userId);
    const user = await this.userRepository.update(userId, {
      first_name: updateProfileDto.firstName,
      last_name: updateProfileDto.lastName,
    });

    this.logger.log(`User ${userId} profile updated`);
    return user;
  }

  /**
   * Changes the password after checking the current one, then signs the user out everywhere
   * except the session that made the change.
   */
  async changePassword(
    userId: string,
    currentIdentitySessionId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.findById(userId);

    if (user.password_hash === null) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.SSO_ACCOUNT_NO_LOCAL_PASSWORD),
      );
    }

    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.CURRENT_PASSWORD_INCORRECT),
      );
    }

    const newPasswordHash = await bcrypt.hash(
      changePasswordDto.newPassword,
      this.BCRYPT_ROUNDS,
    );
    await this.userRepository.update(userId, {
      password_hash: newPasswordHash,
    });

    await this.sessionInvalidationService.invalidateAllUserSessions(userId, {
      exceptIdentitySessionId: currentIdentitySessionId,
    });

    this.logger.log(`Password changed for user ${userId}`);
  }

  // ─── Tenant members (tenant admin) ────────────────────────────

  async listMembers(tenantId: string): Promise<UserTenantWithUserRow[]> {
    return this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) => this.userTenantRepository.findMembers(tenantId, { client }),
    );
  }

  /**
   * Changes a member's role or turns their access off or on. The member's sessions in this
   * tenant end when their role changes or they are deactivated, so the change applies at once.
   */
  async updateMember(
    actor: MemberActor,
    targetUserId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserTenantWithUserRow> {
    if (
      updateUserDto.role === undefined &&
      updateUserDto.isActive === undefined
    ) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.NO_FIELDS_TO_UPDATE),
      );
    }
    if (targetUserId === actor.userId) {
      throw new ForbiddenException(
        this.i18n.t(UsersI18n.errors.CANNOT_CHANGE_OWN_ACCESS),
      );
    }

    const { previous, updated } =
      await this.databaseService.transactionWithTenantContext(
        { tenantId: actor.tenantId, isTenantAdmin: true },
        async (client) => {
          const previous = await this.requireMember(
            client,
            actor.tenantId,
            targetUserId,
          );

          if (updateUserDto.role !== undefined) {
            const exists = await this.userTenantRepository.roleExistsForTenant(
              actor.tenantId,
              updateUserDto.role,
              { client },
            );
            if (!exists) {
              throw new BadRequestException(
                this.i18n.t(UsersI18n.errors.ROLE_NOT_FOUND),
              );
            }
          }

          // A tenant admin's role and access, and the role itself, are for tenant admins only
          const touchesAdmin =
            previous.role_key === TENANT_ADMIN ||
            updateUserDto.role === TENANT_ADMIN;
          if (touchesAdmin && actor.role !== TENANT_ADMIN) {
            throw new ForbiddenException(
              this.i18n.t(UsersI18n.errors.ONLY_ADMIN_CAN_GRANT_ADMIN),
            );
          }

          const losesAdmin =
            previous.role_key === TENANT_ADMIN &&
            previous.is_active &&
            ((updateUserDto.role !== undefined &&
              updateUserDto.role !== TENANT_ADMIN) ||
              updateUserDto.isActive === false);
          if (losesAdmin) {
            await this.assertAnotherActiveAdmin(client, actor.tenantId);
          }

          await this.userTenantRepository.updateByCompositeKey(
            { userId: targetUserId, tenantId: actor.tenantId },
            {
              role_key: updateUserDto.role,
              is_active: updateUserDto.isActive,
            },
            { client },
          );

          return {
            previous,
            updated: await this.requireMember(
              client,
              actor.tenantId,
              targetUserId,
            ),
          };
        },
      );

    const roleChanged = updated.role_key !== previous.role_key;
    const deactivated = previous.is_active && !updated.is_active;
    if (roleChanged || deactivated) {
      await this.sessionInvalidationService.invalidateTenantSessions(
        targetUserId,
        actor.tenantId,
      );
    }

    this.logger.log(
      `User ${targetUserId} updated in tenant ${actor.tenantId} by ${actor.userId}`,
    );
    return updated;
  }

  /** Removes a member from the tenant and ends their sessions in it. */
  async removeMember(actor: MemberActor, targetUserId: string): Promise<void> {
    if (targetUserId === actor.userId) {
      throw new ForbiddenException(
        this.i18n.t(UsersI18n.errors.CANNOT_REMOVE_YOURSELF),
      );
    }

    await this.databaseService.transactionWithTenantContext(
      { tenantId: actor.tenantId, isTenantAdmin: true },
      async (client) => {
        const member = await this.requireMember(
          client,
          actor.tenantId,
          targetUserId,
        );
        if (member.role_key === TENANT_ADMIN) {
          if (actor.role !== TENANT_ADMIN) {
            throw new ForbiddenException(
              this.i18n.t(UsersI18n.errors.ONLY_ADMIN_CAN_GRANT_ADMIN),
            );
          }
          if (member.is_active) {
            await this.assertAnotherActiveAdmin(client, actor.tenantId);
          }
        }
        await this.userTenantRepository.deleteByCompositeKey(
          { userId: targetUserId, tenantId: actor.tenantId },
          { client },
        );
      },
    );

    await this.sessionInvalidationService.invalidateTenantSessions(
      targetUserId,
      actor.tenantId,
    );

    this.logger.log(
      `User ${targetUserId} removed from tenant ${actor.tenantId} by ${actor.userId}`,
    );
  }

  private async requireMember(
    client: PoolClient,
    tenantId: string,
    userId: string,
  ): Promise<UserTenantWithUserRow> {
    const member = await this.userTenantRepository.getUserInTenant(
      userId,
      tenantId,
      { client },
    );
    if (!member) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }
    return member;
  }

  /** Called before an active admin loses the role or access: someone else must keep it. */
  private async assertAnotherActiveAdmin(
    client: PoolClient,
    tenantId: string,
  ): Promise<void> {
    const admins = await this.userTenantRepository.countActiveAdminsForUpdate(
      tenantId,
      { client },
    );
    if (admins <= 1) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.LAST_ACTIVE_ADMIN),
      );
    }
  }

  // ─── Member sessions (tenant admin) ───────────────────────────

  /**
   * List a target user's active sessions scoped to a specific tenant.
   * Requires the target user to be an active member of the tenant.
   */
  async listTenantUserSessions(
    tenantId: string,
    targetUserId: string,
  ): Promise<SessionListResponseDto> {
    await this.assertUserBelongsToTenant(targetUserId, tenantId);

    const identitySessionIds =
      await this.sessionService.getIdentitySessionIds(targetUserId);
    const sessions: SessionListResponseDto['sessions'] = [];

    for (const identitySessionId of identitySessionIds) {
      const identitySession =
        await this.sessionService.findIdentitySessionById(identitySessionId);
      if (!identitySession || identitySession.userId !== targetUserId) continue;

      const tenantSessions: TenantSessionItemDto[] = [];
      for (const tenantSessionId of identitySession.activeTenantSessionIds) {
        const tenantSession =
          await this.sessionService.findTenantSessionById(tenantSessionId);

        if (
          !tenantSession ||
          tenantSession.userId !== targetUserId ||
          tenantSession.tenantId !== tenantId
        ) {
          continue;
        }

        tenantSessions.push({
          sessionId: tenantSessionId,
          tenantId: tenantSession.tenantId,
          role: tenantSession.role,
          createdAt: tenantSession.createdAt,
          lastActivityAt: tenantSession.lastActivityAt,
          isCurrent: false,
        });
      }

      if (tenantSessions.length === 0) continue;

      sessions.push({
        identitySession: {
          sessionId: identitySessionId,
          deviceInfo: identitySession.deviceInfo,
          ipAddress: identitySession.ipAddress,
          geoLocation: identitySession.geoLocation,
          sessionName: identitySession.sessionName,
          createdAt: identitySession.createdAt,
          lastActivityAt: identitySession.lastActivityAt,
          isCurrent: false,
        },
        tenantSessions,
      });
    }

    return { sessions };
  }

  /**
   * Force logout all tenant sessions for a target user in a specific tenant.
   * Requires the target user to be an active member of the tenant.
   */
  async forceLogoutUserFromTenantSessions(
    tenantId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertUserBelongsToTenant(targetUserId, tenantId);
    await this.sessionInvalidationService.invalidateTenantSessions(
      targetUserId,
      tenantId,
    );
  }

  /**
   * Force logout a specific tenant session for a target user.
   * Session must belong to target user and tenant.
   */
  async forceLogoutSpecificTenantSession(
    tenantId: string,
    targetUserId: string,
    sessionId: string,
  ): Promise<void> {
    await this.assertUserBelongsToTenant(targetUserId, tenantId);

    const tenantSession =
      await this.sessionService.findTenantSessionById(sessionId);
    if (
      !tenantSession ||
      tenantSession.userId !== targetUserId ||
      tenantSession.tenantId !== tenantId
    ) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }

    await this.sessionService.deleteTenantSession(
      sessionId,
      targetUserId,
      tenantId,
    );
  }

  /** Ensure target user is an active member of tenant (read in the tenant's own context). */
  private async assertUserBelongsToTenant(
    targetUserId: string,
    tenantId: string,
  ): Promise<void> {
    const member = await this.databaseService.transactionWithTenantContext(
      { tenantId },
      (client) =>
        this.userTenantRepository.getUserInTenant(targetUserId, tenantId, {
          client,
        }),
    );

    if (!member?.is_active) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }
  }
}
