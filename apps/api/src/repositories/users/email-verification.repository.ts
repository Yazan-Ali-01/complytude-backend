import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BaseRepository } from '../base/base.repository';
import { QueryOptions } from '../base/repository.interface';
import {
  CreateEmailVerificationInput,
  EmailVerification,
} from './interfaces/email-verification.interface';

type EmailVerificationRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  verified_at: Date | null;
};

type CreateEmailVerificationRow = Pick<
  EmailVerificationRow,
  'user_id' | 'token' | 'expires_at'
>;

/**
 * Repository for managing Email Verification entities.
 * Handles creation and verification of email tokens.
 */
@Injectable()
export class EmailVerificationRepository extends BaseRepository<
  EmailVerification,
  CreateEmailVerificationRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.email_verifications');
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, user_id, token, expires_at, verified_at';
  }

  /**
   * Map a database row to an EmailVerification domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped EmailVerification entity
   */
  protected mapRow(row: Record<string, unknown>): EmailVerification {
    const data = row as EmailVerificationRow;
    return {
      id: data.id,
      userId: data.user_id,
      token: data.token,
      expiresAt: data.expires_at,
      verifiedAt: data.verified_at,
    };
  }

  /**
   * Create a new email verification record.
   *
   * @param input - Data to create verification record
   * @param options - Query options
   * @returns Created EmailVerification entity
   */
  async createEmailVerification(
    input: CreateEmailVerificationInput,
    options?: QueryOptions,
  ): Promise<EmailVerification> {
    const payload: CreateEmailVerificationRow = {
      user_id: input.userId,
      token: input.token,
      expires_at: input.expiresAt,
    };

    return this.create(payload, options);
  }

  /**
   * Find a valid, unexpired, and unverified verification record by token.
   *
   * @param token - The verification token
   * @param options - Query options
   * @returns Verification record or null
   */
  async findByToken(
    token: string,
    options?: QueryOptions,
  ): Promise<EmailVerification | null> {
    const result = await this.executeQuery<EmailVerificationRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} 
       WHERE token = $1 AND expires_at > NOW() AND verified_at IS NULL`,
      [token],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Mark a verification record as completed (verified).
   *
   * @param verificationId - The ID of the verification record
   * @param options - Query options
   */
  async markCompleted(
    verificationId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET verified_at = NOW() WHERE id = $1`,
      [verificationId],
      options,
    );
  }
}
