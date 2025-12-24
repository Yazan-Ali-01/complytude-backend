import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  EmailVerification,
  CreateEmailVerificationInput,
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
  'id' | 'user_id' | 'token' | 'expires_at'
>;

@Injectable()
export class EmailVerificationRepository extends BaseRepository<
  EmailVerification,
  CreateEmailVerificationRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.email_verifications');
  }

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

  async createEmailVerification(
    input: CreateEmailVerificationInput,
    options?: QueryOptions,
  ): Promise<EmailVerification> {
    const payload: CreateEmailVerificationRow = {
      id: input.id,
      user_id: input.userId,
      token: input.token,
      expires_at: input.expiresAt,
    };

    return this.create(payload, options);
  }

  async findByToken(
    token: string,
    options?: QueryOptions,
  ): Promise<EmailVerification | null> {
    const result = await this.executeQuery<EmailVerificationRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE token = $1 AND expires_at > NOW() AND verified_at IS NULL`,
      [token],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return this.mapRow(row);
  }

  async markCompleted(
    verificationId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      'UPDATE public.email_verifications SET verified_at = NOW() WHERE id = $1',
      [verificationId],
      options,
    );
  }
}
