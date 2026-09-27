import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { SessionListResponseDto } from '../auth/dto/session-list-response.dto';
import type { TenantSessionItemDto } from '../auth/dto/session-response.dto';
import { SessionInvalidationService } from '../auth/services/session-invalidation.service';
import { SessionService } from '../auth/services/session.service';
import { UsersI18n } from './constants/i18n.constants';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly i18n: I18nService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User> {
    const result = await this.databaseService.query(
      'SELECT * FROM public.users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
          args: { userId },
        }),
      );
    }

    return new User(result.rows[0]);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User> {
    const result = await this.databaseService.query(
      'SELECT * FROM public.users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_EMAIL, {
          args: { email },
        }),
      );
    }

    return new User(result.rows[0]);
  }

  /**
   * Get all tenants accessible by a user
   */
  async getUserTenants(userId: string): Promise<any[]> {
    const result = await this.databaseService.query(
      `SELECT ut.tenant_id, ut.role_key, r.name as role_name, ut.is_active, ut.joined_at
       FROM public.user_tenants ut
       INNER JOIN public.tenant_roles r ON r.key = ut.role_key
         AND (r.tenant_id = ut.tenant_id OR r.is_system = true)
       JOIN public.tenants t ON ut.tenant_id = t.id
       WHERE ut.user_id = $1
       ORDER BY ut.joined_at DESC`,
      [userId],
    );

    return result.rows;
  }

  /**
   * Update user's own profile
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updateProfileDto.firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      values.push(updateProfileDto.firstName);
    }

    if (updateProfileDto.lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      values.push(updateProfileDto.lastName);
    }

    if (updateFields.length === 0) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.NO_FIELDS_TO_UPDATE),
      );
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const query = `
      UPDATE public.users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.databaseService.query(query, values);

    this.logger.log(`User ${userId} profile updated`);

    return new User(result.rows[0]);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    // Get current password hash
    const result = await this.databaseService.query(
      'SELECT password_hash FROM public.users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
          args: { userId },
        }),
      );
    }

    const user = result.rows[0] as { password_hash: string | null };

    if (user.password_hash === null) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.SSO_ACCOUNT_NO_LOCAL_PASSWORD),
      );
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password_hash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.CURRENT_PASSWORD_INCORRECT),
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(
      changePasswordDto.newPassword,
      this.BCRYPT_ROUNDS,
    );

    await this.databaseService.transaction(async (client) => {
      await client.query(
        'UPDATE public.users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId],
      );
    });

    await this.sessionInvalidationService.invalidateAllUserSessions(userId);

    this.logger.log(`Password changed for user ${userId}`);
  }

  /**
   * List all users in a tenant (admin/member only)
   */
  async listTenantUsers(tenantId: string): Promise<Record<string, unknown>[]> {
    return this.databaseService.transaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);

      const result = await client.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.is_verified, u.created_at,
              ut.role, ut.is_active, ut.joined_at
       FROM public.user_tenants ut
       JOIN public.users u ON ut.user_id = u.id
       WHERE ut.tenant_id = $1
       ORDER BY ut.joined_at DESC`,
        [tenantId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        isVerified: row.is_verified,
        createdAt: row.created_at,
        role: row.role,
        isActive: row.is_active,
        joinedAt: row.joined_at,
      }));
    });
  }

  /**
   * Create a new user and add to tenant (admin only)
   */
  async createUser(
    tenantId: string,
    createUserDto: CreateUserDto,
  ): Promise<Record<string, unknown>> {
    // Check if email already exists
    const existingUser = await this.databaseService.query(
      'SELECT id FROM public.users WHERE email = $1',
      [createUserDto.email],
    );

    let userId: string;

    if (existingUser.rows.length > 0) {
      // User exists, check if already in tenant
      userId = existingUser.rows[0].id as string;

      const existingAssociation = await this.databaseService.query(
        'SELECT * FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId],
      );

      if (existingAssociation.rows.length > 0) {
        throw new ConflictException(
          this.i18n.t(UsersI18n.errors.USER_ALREADY_EXISTS_IN_TENANT),
        );
      }
    } else {
      // Create new user
      userId = randomUUID();
      const passwordHash = await bcrypt.hash(
        createUserDto.password,
        this.BCRYPT_ROUNDS,
      );

      await this.databaseService.query(
        `INSERT INTO public.users (id, email, password_hash, first_name, last_name, is_verified)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [
          userId,
          createUserDto.email,
          passwordHash,
          createUserDto.firstName,
          createUserDto.lastName,
        ],
      );

      // Create email verification token
      const verificationToken = randomUUID();
      const verificationId = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.databaseService.query(
        `INSERT INTO public.email_verifications (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [verificationId, userId, verificationToken, expiresAt],
      );

      // TODO: Send verification email
      this.logger.log(
        `Verification token for ${createUserDto.email}: ${verificationToken}`,
      );
    }

    // Add user to tenant with role key
    await this.databaseService.query(
      `INSERT INTO public.user_tenants (user_id, tenant_id, role_key, is_active)
       VALUES ($1, $2, $3, true)`,
      [userId, tenantId, createUserDto.role],
    );

    this.logger.log(`User ${userId} added to tenant ${tenantId}`);

    // Return user info
    const userResult = await this.databaseService.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_verified, u.created_at,
              ut.role_key, ut.is_active, ut.joined_at
       FROM public.users u
       JOIN public.user_tenants ut ON u.id = ut.user_id
       WHERE u.id = $1 AND ut.tenant_id = $2`,
      [userId, tenantId],
    );

    const user = userResult.rows[0];
    return {
      id: user.id as string,
      email: user.email as string,
      firstName: user.first_name as string,
      lastName: user.last_name as string,
      isVerified: user.is_verified as boolean,
      createdAt: user.created_at as Date,
      role: user.role_key as string,
      isActive: user.is_active as boolean,
      joinedAt: user.joined_at as Date,
    };
  }

  /**
   * Update user in tenant (admin only)
   */
  async updateUser(
    tenantId: string,
    targetUserId: string,
    updaterId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    // Check if target user exists in tenant
    const existingAssociation = await this.databaseService.query(
      'SELECT * FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [targetUserId, tenantId],
    );

    if (existingAssociation.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }

    const previous = existingAssociation.rows[0] as {
      role_key: string;
      is_active: boolean;
    };

    // Prevent users from modifying their own admin status
    if (targetUserId === updaterId && updateUserDto.role) {
      throw new ForbiddenException(
        this.i18n.t(UsersI18n.errors.CANNOT_MODIFY_OWN_ROLE),
      );
    }

    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updateUserDto.role !== undefined) {
      updateFields.push(`role_key = $${paramIndex++}`);
      values.push(updateUserDto.role);
    }

    if (updateUserDto.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updateUserDto.isActive);
    }

    if (updateFields.length === 0) {
      throw new BadRequestException(
        this.i18n.t(UsersI18n.errors.NO_FIELDS_TO_UPDATE),
      );
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(targetUserId, tenantId);

    const query = `
      UPDATE public.user_tenants
      SET ${updateFields.join(', ')}
      WHERE user_id = $${paramIndex++} AND tenant_id = $${paramIndex}
      RETURNING *
    `;

    await this.databaseService.query(query, values);

    const roleChanged =
      updateUserDto.role !== undefined &&
      updateUserDto.role !== previous.role_key;
    const deactivated =
      updateUserDto.isActive === false && previous.is_active === true;

    if (roleChanged || deactivated) {
      await this.sessionInvalidationService.invalidateTenantSessions(
        targetUserId,
        tenantId,
      );
    }

    this.logger.log(
      `User ${targetUserId} updated in tenant ${tenantId} by ${updaterId}`,
    );

    // Return updated user info
    return this.getUserInTenant(targetUserId, tenantId);
  }

  /**
   * Remove user from tenant (admin only)
   */
  async removeUserFromTenant(
    tenantId: string,
    targetUserId: string,
    removerId: string,
  ): Promise<void> {
    // Prevent users from removing themselves
    if (targetUserId === removerId) {
      throw new ForbiddenException(
        this.i18n.t(UsersI18n.errors.CANNOT_REMOVE_YOURSELF),
      );
    }

    // Check if target user exists in tenant
    const existingAssociation = await this.databaseService.query(
      'SELECT * FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [targetUserId, tenantId],
    );

    if (existingAssociation.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }

    await this.databaseService.query(
      'DELETE FROM public.user_tenants WHERE user_id = $1 AND tenant_id = $2',
      [targetUserId, tenantId],
    );

    await this.sessionInvalidationService.invalidateTenantSessions(
      targetUserId,
      tenantId,
    );

    this.logger.log(
      `User ${targetUserId} removed from tenant ${tenantId} by ${removerId}`,
    );
  }

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

  /**
   * Get user info within a tenant
   */
  private async getUserInTenant(
    userId: string,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.databaseService.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_verified, u.created_at,
              ut.role_key, r.name as role_name, ut.is_active, ut.joined_at
       FROM public.users u
       JOIN public.user_tenants ut ON u.id = ut.user_id
       INNER JOIN public.tenant_roles r ON r.key = ut.role_key
         AND (r.tenant_id = ut.tenant_id OR r.is_system = true)
       WHERE u.id = $1 AND ut.tenant_id = $2`,
      [userId, tenantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isVerified: user.is_verified,
      createdAt: user.created_at,
      role: user.role_key,
      roleName: user.role_name,
      isActive: user.is_active,
      joinedAt: user.joined_at,
    };
  }

  /**
   * Ensure target user is an active member of tenant.
   */
  private async assertUserBelongsToTenant(
    targetUserId: string,
    tenantId: string,
  ): Promise<void> {
    const result = await this.databaseService.query(
      `SELECT 1
       FROM public.user_tenants
       WHERE user_id = $1 AND tenant_id = $2 AND is_active = true
       LIMIT 1`,
      [targetUserId, tenantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_IN_TENANT),
      );
    }
  }
}
