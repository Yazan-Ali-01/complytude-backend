import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  RefreshToken,
  CreateRefreshTokenInput,
} from './interfaces/refresh-token.intefaces';

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

@Injectable()
export class RefreshTokenRepository extends BaseRepository<
  RefreshToken,
  CreateRefreshTokenRow,
  UpdateRefreshTokenRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.refresh_tokens');
  }

  protected mapRow(row: Record<string, unknown>): RefreshToken {
    const data = row as RefreshTokenRow;
    return {
      id: data.id,
      userId: data.user_id,
      tokenHash: data.token_hash,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      revokedAt: data.revoked_at ?? null,
    };
  }

  async createRefreshToken(
    token: CreateRefreshTokenInput,
    options?: QueryOptions,
  ): Promise<RefreshToken> {
    const payload: CreateRefreshTokenRow = {
      id: token.id,
      user_id: token.userId,
      token_hash: token.tokenHash,
      expires_at: token.expiresAt,
    };

    return this.create(payload, options);
  }

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

  async revokeById(id: string, options?: QueryOptions): Promise<RefreshToken> {
    const updatePayload: UpdateRefreshTokenRow = { revoked_at: new Date() };
    return this.update(id, updatePayload, options);
  }

  async revokeAllByUserId(
    userId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET revoked_at = NOW() 
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
      options,
    );
  }
}
