import {
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
} from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { PoolClient } from 'pg';
import {
  InvitationItemDto,
  InvitationListResponseDto,
} from 'src/modules/auth/dto/invitation-list-response.dto';
import {
  InvitationInvitedByDto,
  ResolveInvitationResponseDto,
} from 'src/modules/auth/dto/resolve-invitation-response.dto';
import type { Invitation } from 'src/repositories/invitations/interfaces/invitation.interface';
import {
  CreateInvitationInput,
  InvitationStatus,
} from 'src/repositories/invitations/interfaces/invitation.interface';
import { InvitationRepository } from 'src/repositories/invitations/invitation.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { EmailService } from '../email/email.service';
import { EntitlementEnforcementService } from '../entitlements/services/entitlement-enforcement.service';
import { lockTenantSeats } from 'src/common/utils/tenant-seats-lock.util';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { InvitationsI18n } from './constants/i18n.constants';

export interface CreateInvitationServiceInput {
  tenantId: string;
  invitedBy: string;
  email: string;
  roleId: string;
  expiresInDays?: number;
}

export interface CreateInvitationServiceResult {
  invitationId: string;
  /** Whether the invitation email went out; if not, the admin can resend it. */
  emailSent: boolean;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly invitationRepository: InvitationRepository,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly entitlementEnforcementService: EntitlementEnforcementService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly i18n: I18nService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Set transaction-local auth flow context
   * MUST be called within a transaction
   */
  private async setAuthFlowContext(client: PoolClient): Promise<void> {
    await client.query(`SELECT set_config('app.is_auth_flow', 'true', true)`);
  }

  /**
   * Set transaction-local tenant context
   * MUST be called within a transaction
   */
  private async setTenantContext(
    tenantId: string,
    client: PoolClient,
  ): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);
  }

  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate a random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Resolve invitation token to get invitation details (PUBLIC - no auth required)
   */
  async resolveInvitation(
    token: string,
  ): Promise<ResolveInvitationResponseDto> {
    return this.databaseService.transaction(async (client) => {
      // Set auth flow context
      await this.setAuthFlowContext(client);

      // Hash token and lookup
      const tokenHash = this.hashToken(token);
      const invitation = await this.invitationRepository.findByToken(
        tokenHash,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_NOT_FOUND_OR_EXPIRED),
        );
      }

      // Check expiration
      if (new Date() > invitation.expiresAt) {
        throw new BadRequestException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_EXPIRED),
        );
      }

      // Get tenant and inviter details
      const [tenant, inviter] = await Promise.all([
        client.query<{ id: string; name: string }>(
          `SELECT id, name FROM public.tenants WHERE id = $1`,
          [invitation.tenantId],
        ),
        this.userRepository.findById(invitation.invitedBy, { client }),
      ]);

      if (!tenant.rows[0]) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.TENANT_NOT_FOUND),
        );
      }

      if (!inviter) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITER_NOT_FOUND),
        );
      }

      const inviterInfo: InvitationInvitedByDto = {
        email: inviter.email,
        name: `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim(),
      };

      return {
        invitationId: invitation.id,
        email: invitation.email,
        tenantId: invitation.tenantId,
        tenantName: tenant.rows[0].name,
        role: invitation.roleKey,
        roleName: invitation.roleName,
        invitedBy: inviterInfo,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      };
    });
  }

  /**
   * Constant-time comparison of a presented invitation token with the stored sha256 hash.
   */
  private isTokenForInvitation(token: string, tokenHash: string): boolean {
    const presented = Buffer.from(this.hashToken(token), 'hex');
    const stored = Buffer.from(tokenHash, 'hex');
    return (
      presented.length === stored.length &&
      crypto.timingSafeEqual(presented, stored)
    );
  }

  /**
   * Accept invitation (AUTHENTICATED - verified email must match, and the invitation token is required)
   */
  async acceptInvitation(
    invitationId: string,
    token: string,
    userId: string,
    email: string,
  ): Promise<{ message: string }> {
    return this.databaseService.transaction(async (client) => {
      // Set auth flow context
      await this.setAuthFlowContext(client);

      // Get invitation
      const invitation = await this.invitationRepository.findById(
        invitationId,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_NOT_FOUND),
        );
      }

      // The token (from the invitation link) is checked before anything about the invitation
      // is revealed; the invitation ID alone is visible to anyone listing their invitations.
      if (!this.isTokenForInvitation(token, invitation.tokenHash)) {
        throw new ForbiddenException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_TOKEN_INVALID),
        );
      }

      // Validate invitation status
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_WRONG_STATUS, {
            args: { status: invitation.status, action: 'accepted' },
          }),
        );
      }

      // Check expiration
      if (new Date() > invitation.expiresAt) {
        throw new BadRequestException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_EXPIRED),
        );
      }

      // CRITICAL: Email matching check
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        this.logger.warn(
          `User ${email} attempted to accept invitation for ${invitation.email}`,
        );
        throw new ForbiddenException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_EMAIL_MISMATCH),
        );
      }

      // Seat capacity check: only for NEW members (not already active).
      // Uses a live COUNT(*) from user_tenants rather than the ledger-based
      // projection, because capacity features are bidirectional (users can be
      // removed) and the projection can only increment.
      const existingMembership =
        await this.userTenantRepository.findByCompositeKey(
          { userId, tenantId: invitation.tenantId },
          { client },
        );
      const isNewMember = !existingMembership || !existingMembership.is_active;
      if (isNewMember) {
        await lockTenantSeats(client, invitation.tenantId);
        const [activeMembers, seatEntitlement] = await Promise.all([
          this.userTenantRepository.countActiveByTenant(invitation.tenantId, {
            client,
          }),
          this.entitlementResolver.resolveForTenant(
            invitation.tenantId,
            'user_seats',
            { client },
          ),
        ]);
        const seatLimit = seatEntitlement?.value_int ?? 0;
        if (seatLimit !== -1 && activeMembers >= seatLimit) {
          throw new ForbiddenException({
            message: this.i18n.t(InvitationsI18n.errors.SEAT_LIMIT_REACHED),
            statusCode: 403,
          });
        }
      }

      // Mark invitation as accepted first
      await this.invitationRepository.markAccepted(invitationId, { client });

      // Upsert user-tenant relationship (handles race conditions atomically)
      const { wasCreated } = await this.userTenantRepository.upsertUserTenant(
        {
          userId,
          tenantId: invitation.tenantId,
          roleKey: invitation.roleKey,
          isActive: true,
        },
        { client },
      );

      if (!wasCreated) {
        this.logger.warn(
          `User ${userId} was already a member of tenant ${invitation.tenantId}, reactivated membership`,
        );
        return {
          message: this.i18n.t(
            InvitationsI18n.messages.ALREADY_MEMBER_REACTIVATED,
          ),
        };
      }

      this.logger.log(
        `User ${userId} accepted invitation ${invitationId} to tenant ${invitation.tenantId}`,
      );

      return {
        message: this.i18n.t(InvitationsI18n.messages.ACCEPTED_SUCCESSFULLY),
      };
    });
  }

  /**
   * Reject invitation (AUTHENTICATED - email must match)
   */
  async rejectInvitation(
    invitationId: string,
    userId: string,
    email: string,
  ): Promise<{ message: string }> {
    return this.databaseService.transaction(async (client) => {
      // Set auth flow context
      await this.setAuthFlowContext(client);

      // Get invitation
      const invitation = await this.invitationRepository.findById(
        invitationId,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_NOT_FOUND),
        );
      }

      // Validate invitation status
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_WRONG_STATUS, {
            args: { status: invitation.status, action: 'rejected' },
          }),
        );
      }

      // CRITICAL: Email matching check
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        this.logger.warn(
          `User ${email} attempted to reject invitation for ${invitation.email}`,
        );
        throw new ForbiddenException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_EMAIL_MISMATCH),
        );
      }

      // Mark invitation as rejected
      await this.invitationRepository.markRejected(invitationId, { client });

      this.logger.log(`User ${userId} rejected invitation ${invitationId}`);

      return {
        message: this.i18n.t(InvitationsI18n.messages.REJECTED_SUCCESSFULLY),
      };
    });
  }

  /**
   * List pending invitations for a user (AUTHENTICATED)
   */
  async listUserInvitations(email: string): Promise<InvitationListResponseDto> {
    return this.databaseService.transaction(async (client) => {
      // Set auth flow context
      await this.setAuthFlowContext(client);

      // Query invitations with tenant and inviter info
      const result = await client.query<{
        id: string;
        tenant_id: string;
        tenant_name: string;
        role_key: string;
        role_name: string;
        inviter_email: string;
        inviter_first_name: string | null;
        inviter_last_name: string | null;
        expires_at: Date;
        created_at: Date;
      }>(
        `SELECT
          i.id,
          i.tenant_id,
          t.name as tenant_name,
          r.key as role_key,
          r.name as role_name,
          u.email as inviter_email,
          u.first_name as inviter_first_name,
          u.last_name as inviter_last_name,
          i.expires_at,
          i.created_at
        FROM public.invitations i
        INNER JOIN public.tenant_roles r ON r.id = i.role_id
        INNER JOIN public.tenants t ON i.tenant_id = t.id
        INNER JOIN public.users u ON i.invited_by = u.id
        WHERE i.email = $1
          AND i.status = '${InvitationStatus.PENDING}'
          AND i.expires_at > NOW()
        ORDER BY i.created_at DESC`,
        [email],
      );

      const invitations: InvitationItemDto[] = result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        role: row.role_key,
        roleName: row.role_name,
        invitedBy: {
          email: row.inviter_email,
          name:
            `${row.inviter_first_name || ''} ${row.inviter_last_name || ''}`.trim() ||
            null,
        },
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      }));

      return { invitations };
    });
  }

  /**
   * Count pending invitations for a user
   */
  async countUserInvitations(email: string): Promise<number> {
    return this.databaseService.transaction(async (client) => {
      // Set auth flow context
      await this.setAuthFlowContext(client);

      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count
        FROM public.invitations
        WHERE email = $1 AND status = '${InvitationStatus.PENDING}' AND expires_at > NOW()`,
        [email],
      );

      return parseInt(result.rows[0]?.count || '0', 10);
    });
  }

  /**
   * Get role ID by role key (for a specific tenant or system role)
   */
  async getRoleIdByKey(
    roleKey: string,
    tenantId: string,
  ): Promise<{ id: string; name: string } | null> {
    const result = await this.databaseService.query<{
      id: string;
      name: string;
    }>(
      `SELECT id, name
       FROM public.tenant_roles
       WHERE key = $1 AND (tenant_id = $2 OR is_system = true)
       ORDER BY is_system DESC
       LIMIT 1`,
      [roleKey, tenantId],
    );

    return result.rows[0] || null;
  }

  /**
   * Create invitation (TENANT ADMIN ONLY)
   */
  async createInvitation(
    input: CreateInvitationServiceInput,
  ): Promise<CreateInvitationServiceResult> {
    const created = await this.databaseService.transaction(async (client) => {
      // Set tenant context
      await this.setTenantContext(input.tenantId, client);

      // Check for existing pending invitation
      const existing = await this.invitationRepository.findByEmailAndTenant(
        input.email,
        input.tenantId,
        { client },
      );

      if (existing) {
        throw new ConflictException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_ALREADY_EXISTS),
        );
      }

      // Check if user is already a member
      const user = await this.userRepository.findOne({
        filters: { email: input.email },
        select: ['id'],
        client,
      });

      if (user) {
        const existingMembership =
          await this.userTenantRepository.findByCompositeKey(
            {
              userId: user.id,
              tenantId: input.tenantId,
            },
            { client },
          );

        if (existingMembership) {
          throw new ConflictException(
            this.i18n.t(InvitationsI18n.errors.USER_ALREADY_MEMBER),
          );
        }
      }

      // Seat capacity check: members + pending invitations must not exceed limit.
      // Uses a live COUNT(*) from user_tenants (same source of truth as the
      // accept flow) because capacity features are bidirectional and the
      // aggregated_usage projection can only increment.
      await lockTenantSeats(client, input.tenantId);
      const occupancyResult = await client.query<{
        active_members: string;
        pending_invitations: string;
      }>(
        `SELECT
          (SELECT COUNT(*) FROM public.user_tenants WHERE tenant_id = $1 AND is_active = true) AS active_members,
          (SELECT COUNT(*) FROM public.invitations WHERE tenant_id = $1 AND status = $2 AND expires_at > NOW()) AS pending_invitations`,
        [input.tenantId, InvitationStatus.PENDING],
      );
      const activeMembers = parseInt(
        occupancyResult.rows[0].active_members,
        10,
      );
      const pendingInvitations = parseInt(
        occupancyResult.rows[0].pending_invitations,
        10,
      );
      const seatEntitlement = await this.entitlementResolver.resolveForTenant(
        input.tenantId,
        'user_seats',
        { client },
      );
      const seatLimit = seatEntitlement?.value_int ?? 0;
      const currentOccupancy = activeMembers + pendingInvitations;
      if (seatLimit !== -1 && currentOccupancy >= seatLimit) {
        throw new ForbiddenException({
          message: this.i18n.t(
            InvitationsI18n.errors.SEAT_LIMIT_REACHED_FOR_INVITE,
          ),
          statusCode: 403,
        });
      }

      // Generate token
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);

      // Calculate expiration
      const expiresInDays = input.expiresInDays || 7;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // Create invitation
      const invitationInput: CreateInvitationInput = {
        email: input.email,
        tenantId: input.tenantId,
        tokenHash,
        invitedBy: input.invitedBy,
        expiresAt,
        roleId: input.roleId,
      };

      const invitation = await this.invitationRepository.createInvitation(
        invitationInput,
        { client },
      );

      this.logger.log(
        `Created invitation ${invitation.id} for ${input.email} to tenant ${input.tenantId}`,
      );

      // Advance onboarding past invite_team on first invite sent — idempotent.
      await client.query(
        `UPDATE public.tenants
         SET onboarding_current_step = 'first_action', updated_at = now()
         WHERE id = $1
           AND onboarding_current_step = 'invite_team'`,
        [input.tenantId],
      );

      return { invitationId: invitation.id, token };
    });

    // After the commit, so a rollback never leaves a mailed link without its invitation
    return {
      invitationId: created.invitationId,
      emailSent: await this.emailInvitation(
        created.invitationId,
        input.tenantId,
        created.token,
      ),
    };
  }

  /**
   * Resend invitation (generate new token) (TENANT ADMIN ONLY)
   */
  async resendInvitation(
    invitationId: string,
    tenantId: string,
  ): Promise<{ emailSent: boolean }> {
    const { token } = await this.databaseService.transaction(async (client) => {
      // Set tenant context
      await this.setTenantContext(tenantId, client);

      // Get invitation
      const invitation = await this.invitationRepository.findById(
        invitationId,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_NOT_FOUND),
        );
      }

      if (invitation.tenantId !== tenantId) {
        throw new ForbiddenException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_WRONG_TENANT),
        );
      }

      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException(
          this.i18n.t(InvitationsI18n.errors.CAN_ONLY_RESEND_PENDING),
        );
      }

      // Generate new token
      const token = this.generateToken();
      const tokenHash = this.hashToken(token);

      // Update invitation with new token and extended expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await client.query(
        `UPDATE public.invitations
        SET token_hash = $1, expires_at = $2, updated_at = NOW()
        WHERE id = $3`,
        [tokenHash, expiresAt, invitationId],
      );

      this.logger.log(`Resent invitation ${invitationId}`);

      return { token };
    });

    return {
      emailSent: await this.emailInvitation(invitationId, tenantId, token),
    };
  }

  /**
   * Emails the invitee their link, in the tenant's language. The token is only ever in this
   * email: it is not returned to the admin or logged. A failed send is reported, not thrown, so
   * the admin can resend.
   */
  private async emailInvitation(
    invitationId: string,
    tenantId: string,
    token: string,
  ): Promise<boolean> {
    try {
      const details = await this.databaseService.transactionWithTenantContext(
        { tenantId },
        async (client) =>
          (
            await client.query<{
              email: string;
              expires_at: Date;
              tenant_name: string | null;
              locale: string | null;
              role_name: string | null;
              inviter_first_name: string | null;
              inviter_last_name: string | null;
              inviter_email: string | null;
            }>(
              `SELECT i.email, i.expires_at, t.name AS tenant_name, t.locale, r.name AS role_name,
                      u.first_name AS inviter_first_name, u.last_name AS inviter_last_name,
                      u.email AS inviter_email
               FROM public.invitations i
               JOIN public.tenants t ON t.id = i.tenant_id
               LEFT JOIN public.tenant_roles r ON r.id = i.role_id
               LEFT JOIN public.users u ON u.id = i.invited_by
               WHERE i.id = $1`,
              [invitationId],
            )
          ).rows[0],
      );
      if (!details) return false;

      const inviterName =
        [details.inviter_first_name, details.inviter_last_name]
          .filter(Boolean)
          .join(' ') ||
        details.inviter_email ||
        '';
      await this.emailService.sendInvitationEmail(
        {
          to: details.email,
          tenantName: details.tenant_name ?? '',
          inviterName,
          roleName: details.role_name ?? '',
          token,
          expiresAt: new Date(details.expires_at),
        },
        details.locale ?? 'en',
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Invitation email failed for invitation ${invitationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Revoke invitation (TENANT ADMIN ONLY)
   */
  async revokeInvitation(
    invitationId: string,
    tenantId: string,
    revokedBy: string,
  ): Promise<{ message: string }> {
    return this.databaseService.transaction(async (client) => {
      // Set tenant context
      await this.setTenantContext(tenantId, client);

      // Get invitation
      const invitation = await this.invitationRepository.findById(
        invitationId,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_NOT_FOUND),
        );
      }

      if (invitation.tenantId !== tenantId) {
        throw new ForbiddenException(
          this.i18n.t(InvitationsI18n.errors.INVITATION_WRONG_TENANT),
        );
      }

      // Revoke invitation
      await this.invitationRepository.revokeInvitation(
        invitationId,
        { revokedBy },
        { client },
      );

      this.logger.log(
        `Invitation ${invitationId} revoked by user ${revokedBy}`,
      );

      return {
        message: this.i18n.t(InvitationsI18n.messages.REVOKED_SUCCESSFULLY),
      };
    });
  }

  /**
   * List invitations for a tenant (TENANT ADMIN ONLY)
   */
  async listTenantInvitations(
    tenantId: string,
    filters: {
      email?: string;
      status?: InvitationStatus;
    } = {},
    cursorOptions?: CursorPaginationOptions,
  ): Promise<CursorPaginationResult<Invitation>> {
    return this.databaseService.transaction(async (client) => {
      // Set tenant context
      await this.setTenantContext(tenantId, client);

      // Use repository pagination
      return this.invitationRepository.findByTenant(
        tenantId,
        filters,
        cursorOptions,
        { client },
      );
    });
  }
}
