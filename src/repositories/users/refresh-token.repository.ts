import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';
import { RefreshToken, TokenType } from './interfaces/refresh-token.interfaces';

type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  token_type: TokenType;
  tenant_id: string | null;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
};

type CreateRefreshTokenRow = Pick<
  RefreshTokenRow,
  'user_id' | 'token_hash' | 'token_type' | 'tenant_id' | 'expires_at'
>;

type UpdateRefreshTokenRow = Partial<
  Pick<RefreshTokenRow, 'token_hash' | 'expires_at' | 'revoked_at'>
>;

/**
 * Repository for managing Refresh Token entities.
 * Handles storage and revocation of JWT refresh tokens.
 */
@Injectable()
export class RefreshTokenRepository extends BaseRepository<
  RefreshToken,
  CreateRefreshTokenRow,
  UpdateRefreshTokenRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.refresh_tokens');
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, user_id, token_hash, token_type, tenant_id, expires_at, created_at, revoked_at';
  }

  /**
   * Map a database row to a RefreshToken domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped RefreshToken entity
   */
  protected mapRow(row: Record<string, unknown>): RefreshToken {
    const data = row as RefreshTokenRow;
    return {
      id: data.id,
      userId: data.user_id,
      tokenHash: data.token_hash,
      tokenType: data.token_type,
      tenantId: data.tenant_id,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      revokedAt: data.revoked_at,
    };
  }

  /**
   * Find a valid, unexpired, and unrevoked refresh token by token hash.
   *
   * @param tokenHash - The token hash
   * @param options - Query options
   * @returns The RefreshToken entity or null if not found
   */
  async findByTokenHash(
    tokenHash: string,
    options?: QueryOptions,
  ): Promise<RefreshToken | null> {
    const result = await this.executeQuery<RefreshTokenRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE token_hash = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
      [tokenHash],
      options,
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Revoke a specific refresh token by ID.
   *
   * @param id - The token ID
   * @param options - Query options
   * @returns The revoked RefreshToken entity or null if not found
   */
  async revokeById(
    id: string,
    options?: QueryOptions,
  ): Promise<RefreshToken | null> {
    const result = await this.executeQuery<RefreshTokenRow>(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE id = $1 AND revoked_at IS NULL 
       RETURNING ${this.getSelectColumns()}`,
      [id],
      options,
    );
    if (result.rowCount === 0) {
      return null;
    }
    return this.mapRow(result.rows[0]);
  }

  /**
   * Revoke all active refresh tokens for a user.
   * Used for security events like password changes or logout all devices.
   *
   * @param userId - The user ID
   * @param options - Query options
   * @returns Number of tokens revoked (0 if none found)
   */
  async revokeAllByUserId(
    userId: string,
    options?: QueryOptions,
  ): Promise<number> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
      options,
    );
    return result.rowCount ?? 0;
  }

  /**
   * Find a valid identity refresh token by token hash.
   *
   * @param userId - The user ID
   * @param tokenHash - The token hash
   * @param options - Query options
   * @returns The RefreshToken entity or null if not found
   */
  async findIdentityRefreshToken(
    userId: string,
    tokenHash: string,
    options?: QueryOptions,
  ): Promise<RefreshToken | null> {
    const result = await this.executeQuery<RefreshTokenRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE user_id = $1 AND token_hash = $2 AND token_type = 'identity' 
       AND expires_at > NOW() AND revoked_at IS NULL`,
      [userId, tokenHash],
      options,
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Find a valid tenant refresh token by token hash.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param tokenHash - The token hash
   * @param options - Query options
   * @returns The RefreshToken entity or null if not found
   */
  async findTenantRefreshToken(
    userId: string,
    tenantId: string,
    tokenHash: string,
    options?: QueryOptions,
  ): Promise<RefreshToken | null> {
    const result = await this.executeQuery<RefreshTokenRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE user_id = $1 AND tenant_id = $2 AND token_hash = $3 AND token_type = 'tenant' 
       AND expires_at > NOW() AND revoked_at IS NULL`,
      [userId, tenantId, tokenHash],
      options,
    );
    const row = result.rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Revoke all identity refresh tokens for a user.
   *
   * @param userId - The user ID
   * @param options - Query options
   * @returns Number of tokens revoked (0 if none found)
   */
  async revokeAllIdentityTokens(
    userId: string,
    options?: QueryOptions,
  ): Promise<number> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE user_id = $1 AND token_type = 'identity' AND revoked_at IS NULL`,
      [userId],
      options,
    );
    return result.rowCount ?? 0;
  }

  /**
   * Revoke all tenant refresh tokens for a specific tenant.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Number of tokens revoked (0 if none found)
   */
  async revokeAllTenantTokens(
    userId: string,
    tenantId: string,
    options?: QueryOptions,
  ): Promise<number> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE user_id = $1 AND tenant_id = $2 AND token_type = 'tenant' AND revoked_at IS NULL`,
      [userId, tenantId],
      options,
    );
    return result.rowCount ?? 0;
  }
}
