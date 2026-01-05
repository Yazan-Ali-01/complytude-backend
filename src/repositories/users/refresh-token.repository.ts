import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import { RefreshToken } from './interfaces/refresh-token.interfaces';

type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
};

type CreateRefreshTokenRow = Pick<
  RefreshTokenRow,
  'id' | 'user_id' | 'token_hash' | 'expires_at'
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
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      revokedAt: data.revoked_at,
    };
  }

  /**
   * Find all active (non-expired, non-revoked) refresh tokens for a user.
   *
   * @param userId - The user ID
   * @param options - Query options
   * @returns Array of active RefreshToken entities
   */
  async findActiveByUserId(
    userId: string,
    options?: QueryOptions,
  ): Promise<RefreshToken[]> {
    const result = await this.executeQuery<RefreshTokenRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE user_id = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
      [userId],
      options,
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Revoke a specific refresh token by ID.
   *
   * @param id - The token ID
   * @param options - Query options
   * @returns The revoked RefreshToken entity
   * @throws Error if token not found
   */
  async revokeById(id: string, options?: QueryOptions): Promise<RefreshToken> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE id = $1 AND revoked_at IS NULL`,
      [id],
      options,
    );
    if (result.rowCount === 0) {
      throw new Error(`No refresh tokens found for id ${id}`);
    }
    return this.mapRow(result.rows[0]);
  }

  /**
   * Revoke all active refresh tokens for a user.
   * Used for security events like password changes or logout all devices.
   *
   * @param userId - The user ID
   * @param options - Query options
   * @returns The last revoked token (implementation detail, mainly used to confirm action)
   * @throws Error if no tokens found
   */
  async revokeAllByUserId(
    userId: string,
    options?: QueryOptions,
  ): Promise<RefreshToken> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
      options,
    );
    if (result.rowCount === 0) {
      throw new Error(`No refresh tokens found for user ${userId}`);
    }
    return this.mapRow(result.rows[0]);
  }
}
