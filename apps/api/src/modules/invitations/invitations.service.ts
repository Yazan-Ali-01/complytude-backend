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
import { PoolClient } from 'pg';
import {
  InvitationItemDto,
  InvitationListResponseDto,
} from 'src/modules/auth/dto/invitation-list-response.dto';
import {
  InvitationInvitedByDto,
  ResolveInvitationResponseDto,
} from 'src/modules/auth/dto/resolve-invitation-response.dto';
import {
  CreateInvitationInput,
  InvitationStatus,
} from 'src/repositories/invitations/interfaces/invitation.interface';
import type { Invitation } from 'src/repositories/invitations/interfaces/invitation.interface';
import { InvitationRepository } from 'src/repositories/invitations/invitation.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';

export interface CreateInvitationServiceInput {
  tenantId: string;
  invitedBy: string;
  email: string;
  roleId: string;
  expiresInDays?: number;
}

export interface CreateInvitationServiceResult {
  invitationId: string;
  token: string; // Plain token for email
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly invitationRepository: InvitationRepository,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
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
        throw new NotFoundException('Invitation not found or expired');
      }

      // Check expiration
      if (new Date() > invitation.expiresAt) {
        throw new BadRequestException('Invitation has expired');
      }

      // todo: after adding tenant name, add it to the query
      // todo: use tenant repository instead "after adding the name"
      // Get tenant and inviter details
      const [tenant, inviter] = await Promise.all([
        client.query<{ id: string; name: string }>(
          `SELECT id, 'Tenant ' || substring(id::text, 1, 8) as name FROM public.tenants WHERE id = $1`,
          [invitation.tenantId],
        ),
        this.userRepository.findById(invitation.invitedBy, { client }),
      ]);

      if (!tenant.rows[0]) {
        throw new NotFoundException('Tenant not found');
      }

      if (!inviter) {
        throw new NotFoundException('Inviter not found');
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
   * Accept invitation (AUTHENTICATED - email must match)
   */
  async acceptInvitation(
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
        throw new NotFoundException('Invitation not found');
      }

      // Validate invitation status
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException(
          `Invitation is ${invitation.status} and cannot be accepted`,
        );
      }

      // Check expiration
      if (new Date() > invitation.expiresAt) {
        throw new BadRequestException('Invitation has expired');
      }

      // CRITICAL: Email matching check
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        this.logger.warn(
          `User ${email} attempted to accept invitation for ${invitation.email}`,
        );
        throw new ForbiddenException(
          'This invitation is not for your email address',
        );
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
          message:
            'You were already a member of this tenant. Your membership has been reactivated.',
        };
      }

      this.logger.log(
        `User ${userId} accepted invitation ${invitationId} to tenant ${invitation.tenantId}`,
      );

      return { message: 'Invitation accepted successfully' };
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
        throw new NotFoundException('Invitation not found');
      }

      // Validate invitation status
      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException(
          `Invitation is ${invitation.status} and cannot be rejected`,
        );
      }

      // CRITICAL: Email matching check
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        this.logger.warn(
          `User ${email} attempted to reject invitation for ${invitation.email}`,
        );
        throw new ForbiddenException(
          'This invitation is not for your email address',
        );
      }

      // Mark invitation as rejected
      await this.invitationRepository.markRejected(invitationId, { client });

      this.logger.log(`User ${userId} rejected invitation ${invitationId}`);

      return { message: 'Invitation rejected successfully' };
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
          'Tenant ' || substring(t.id::text, 1, 8) as tenant_name,
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
    return this.databaseService.transaction(async (client) => {
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
          'A pending invitation already exists for this email',
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
            'User is already a member of this tenant',
          );
        }
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

      return {
        invitationId: invitation.id,
        token, // Return plain token for email
      };
    });
  }

  /**
   * Resend invitation (generate new token) (TENANT ADMIN ONLY)
   */
  async resendInvitation(
    invitationId: string,
    tenantId: string,
  ): Promise<{ token: string }> {
    return this.databaseService.transaction(async (client) => {
      // Set tenant context
      await this.setTenantContext(tenantId, client);

      // Get invitation
      const invitation = await this.invitationRepository.findById(
        invitationId,
        { client },
      );

      if (!invitation) {
        throw new NotFoundException('Invitation not found');
      }

      if (invitation.tenantId !== tenantId) {
        throw new ForbiddenException(
          'Invitation does not belong to this tenant',
        );
      }

      if (invitation.status !== InvitationStatus.PENDING) {
        throw new BadRequestException('Can only resend pending invitations');
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
        throw new NotFoundException('Invitation not found');
      }

      if (invitation.tenantId !== tenantId) {
        throw new ForbiddenException(
          'Invitation does not belong to this tenant',
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

      return { message: 'Invitation revoked successfully' };
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
