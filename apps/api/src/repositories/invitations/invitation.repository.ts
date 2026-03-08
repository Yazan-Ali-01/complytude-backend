import {
  BaseRepository,
  CursorPaginationHelper,
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';

import { CommonI18n } from '../../common/constants';
import {
  CreateInvitationInput,
  Invitation,
  InvitationStatus,
  RevokeInvitationInput,
} from './interfaces/invitation.interface';

type InvitationRow = {
  id: string;
  email: string;
  tenant_id: string;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  rejected_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  status: InvitationStatus;
  role_id: string;
  role_key: string;
  role_name: string;
  created_at: Date;
  updated_at: Date;
};

type CreateInvitationRow = {
  email: string;
  tenant_id: string;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  role_id: string;
};

type UpdateInvitationRow = {
  status?: InvitationStatus;
  accepted_at?: Date;
  rejected_at?: Date;
  revoked_at?: Date;
  revoked_by?: string;
};

/**
 * Repository for managing Invitation entities.
 * Handles invitation creation, retrieval, acceptance, and revocation.
 */
@Injectable()
export class InvitationRepository extends BaseRepository<
  Invitation,
  CreateInvitationRow,
  UpdateInvitationRow
> {
  constructor(databaseService: DatabaseService, @I18n() i18n: I18nService) {
    super(databaseService, 'public.invitations', i18n);
  }

  /**
   * Get the list of columns to select in queries.
   * Note: This should be used with the roles JOIN to include role_key and role_name
   */
  protected getSelectColumns(): string {
    return 'i.id, i.email, i.tenant_id, i.token_hash, i.invited_by, i.expires_at, i.accepted_at, i.rejected_at, i.revoked_at, i.revoked_by, i.status, i.role_id, r.key as role_key, r.name as role_name, i.created_at, i.updated_at';
  }

  /**
   * Get the base FROM clause with roles JOIN
   */
  protected getFromClauseWithRoles(): string {
    return `${this.tableName} i
            INNER JOIN public.tenant_roles r ON r.id = i.role_id`;
  }

  /**
   * Override findById to include role details
   */
  async findById(
    id: string,
    options?: QueryOptions,
  ): Promise<Invitation | null> {
    const result = await this.executeQuery<InvitationRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.getFromClauseWithRoles()}
       WHERE i.id = $1
       LIMIT 1`,
      [id],
      options,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Map a database row to an Invitation domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped Invitation entity
   */
  protected mapRow(row: Record<string, unknown>): Invitation {
    const data = row as InvitationRow;
    return {
      id: data.id,
      email: data.email,
      tenantId: data.tenant_id,
      tokenHash: data.token_hash,
      invitedBy: data.invited_by,
      expiresAt: data.expires_at,
      acceptedAt: data.accepted_at,
      rejectedAt: data.rejected_at,
      revokedAt: data.revoked_at,
      revokedBy: data.revoked_by,
      status: data.status,
      roleId: data.role_id,
      roleKey: data.role_key,
      roleName: data.role_name,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Create a new invitation record.
   *
   * @param input - Data to create invitation
   * @param options - Query options
   * @returns Created Invitation entity
   */
  async createInvitation(
    input: CreateInvitationInput,
    options?: QueryOptions,
  ): Promise<Invitation> {
    const payload: CreateInvitationRow = {
      email: input.email,
      tenant_id: input.tenantId,
      token_hash: input.tokenHash,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt,
      role_id: input.roleId,
    };

    // Create the invitation first
    const result = await this.executeQuery<{ id: string }>(
      `INSERT INTO ${this.tableName} (email, tenant_id, token_hash, invited_by, expires_at, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        payload.email,
        payload.tenant_id,
        payload.token_hash,
        payload.invited_by,
        payload.expires_at,
        payload.role_id,
      ],
      options,
    );

    const invitationId = result.rows[0].id;

    // Then fetch with role details
    const invitation = await this.findById(invitationId, options);
    if (!invitation) {
      throw new Error(
        // InvitationRepositoryI18n is required but in phase 2 (InvitationRepositoryI18n.errors.FAILED_TO_CREATE_INVITATION)
        this.i18n.t(CommonI18n.errors.BAD_REQUEST) ??
          'Failed to create invitation',
      );
    }

    return invitation;
  }

  /**
   * Find a valid, unexpired, and pending invitation by token.
   *
   * @param tokenHash - The invitation token hash
   * @param options - Query options
   * @returns Invitation record or null
   */
  async findByToken(
    tokenHash: string,
    options?: QueryOptions,
  ): Promise<Invitation | null> {
    const result = await this.executeQuery<InvitationRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.getFromClauseWithRoles()}
       WHERE i.token_hash = $1 AND i.expires_at > NOW() AND i.status = '${InvitationStatus.PENDING}'`,
      [tokenHash],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Find an invitation by email and tenant ID.
   * Useful for checking if a user already has a pending invitation.
   *
   * @param email - The invitee email
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Invitation record or null
   */
  async findByEmailAndTenant(
    email: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Invitation | null> {
    const result = await this.executeQuery<InvitationRow>(
      `SELECT ${this.getSelectColumns()}
       FROM ${this.getFromClauseWithRoles()}
       WHERE i.email = $1 AND i.tenant_id = $2 AND i.status = '${InvitationStatus.PENDING}'`,
      [email, tenantId],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Find invitations for a specific tenant with cursor-based pagination.
   * Supports filtering by email and status.
   *
   * @param tenantId - The tenant ID
   * @param filters - Optional filters for email and status
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options
   * @returns Cursor-paginated results with navigation metadata
   */
  async findByTenant(
    tenantId: string,
    filters: {
      email?: string;
      status?: InvitationStatus;
    } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<Invitation>> {
    // Validate and normalize cursor options
    const paginationOpts =
      CursorPaginationHelper.validateOptions(cursorOptions);
    const { cursor, limit, direction } = paginationOpts;

    const conditions: string[] = ['i.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (filters.email) {
      params.push(filters.email);
      conditions.push(`i.email ILIKE $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`i.status = $${params.length}`);
    }

    // Add cursor condition using helper
    const cursorQuery = CursorPaginationHelper.buildCursorQuery(
      direction,
      cursor,
      params.length + 1,
    );

    if (cursorQuery.clause) {
      conditions.push(cursorQuery.clause);
      params.push(...cursorQuery.params);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const limitClause = CursorPaginationHelper.buildLimitClause(
      limit,
      params.length + 1,
    );
    params.push(...limitClause.params);

    const query =
      `SELECT ${this.getSelectColumns()} FROM ${this.getFromClauseWithRoles()} ${whereClause} ${cursorQuery.orderClause} ${limitClause.clause}`.trim();
    const result = await this.executeQuery<InvitationRow>(
      query,
      params,
      options,
    );

    // Create pagination response with raw rows (snake_case)
    const paginationResult = CursorPaginationHelper.createPaginationResponse(
      result.rows,
      limit,
      direction,
      !!cursor,
    );

    // Map the data to domain entities (camelCase)
    return {
      ...paginationResult,
      data: paginationResult.data.map((row) => this.mapRow(row)),
    };
  }

  /**
   * Find all pending invitations for a tenant.
   *
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Array of pending invitations
   */
  async findPendingByTenant(
    tenantId: string,
    options?: QueryOptions,
  ): Promise<Invitation[]> {
    const result = await this.findByTenant(
      tenantId,
      { status: InvitationStatus.PENDING },
      { limit: 1000 },
      options,
    );
    return result.data;
  }

  /**
   * Mark an invitation as accepted.
   *
   * @param invitationId - The ID of the invitation
   * @param options - Query options
   * @returns Updated Invitation entity
   */
  async markAccepted(
    invitationId: string,
    options?: QueryOptions,
  ): Promise<Invitation> {
    const payload: UpdateInvitationRow = {
      status: InvitationStatus.ACCEPTED,
      accepted_at: new Date(),
    };

    return this.update(invitationId, payload, options);
  }

  /**
   * Mark an invitation as rejected.
   *
   * @param invitationId - The ID of the invitation
   * @param options - Query options
   * @returns Updated Invitation entity
   */
  async markRejected(
    invitationId: string,
    options?: QueryOptions,
  ): Promise<Invitation> {
    const payload: UpdateInvitationRow = {
      status: InvitationStatus.REJECTED,
      rejected_at: new Date(),
    };

    return this.update(invitationId, payload, options);
  }

  /**
   * Revoke an invitation.
   *
   * @param invitationId - The ID of the invitation
   * @param input - Revocation data (who revoked it)
   * @param options - Query options
   * @returns Updated Invitation entity
   */
  async revokeInvitation(
    invitationId: string,
    input: RevokeInvitationInput,
    options?: QueryOptions,
  ): Promise<Invitation> {
    const payload: UpdateInvitationRow = {
      status: InvitationStatus.REVOKED,
      revoked_at: new Date(),
      revoked_by: input.revokedBy,
    };

    return this.update(invitationId, payload, options);
  }

  /**
   * Mark expired invitations as expired.
   * This should be called periodically (e.g., via a cron job).
   *
   * @param options - Query options
   * @returns Number of invitations marked as expired
   */
  async markExpiredInvitations(options?: QueryOptions): Promise<number> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName}
       SET status = '${InvitationStatus.EXPIRED}'
       WHERE status = '${InvitationStatus.PENDING}' AND expires_at <= NOW()`,
      [],
      options,
    );

    return result.rowCount ?? 0;
  }

  /**
   * Delete an invitation by ID.
   * Note: Typically invitations should be revoked rather than deleted for audit purposes.
   *
   * @param invitationId - The ID of the invitation
   * @param options - Query options
   * @returns Number of rows deleted
   */
  async deleteInvitation(
    invitationId: string,
    options?: QueryOptions,
  ): Promise<number> {
    return this.delete(invitationId, options);
  }
}
