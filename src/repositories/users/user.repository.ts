import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  User,
  CreatePasswordResetInput,
  PasswordReset,
} from './interfaces/user.intefaces';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  is_verified: boolean;
  is_system_admin: boolean;
  created_at: Date;
  updated_at: Date;
};

type CreateUserRow = {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string | null;
  last_name?: string | null;
  is_verified?: boolean;
  is_system_admin?: boolean;
};

type UpdateUserRow = Partial<
  Pick<
    UserRow,
    | 'email'
    | 'password_hash'
    | 'first_name'
    | 'last_name'
    | 'is_verified'
    | 'is_system_admin'
    | 'updated_at'
  >
>;

type PasswordResetRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
};

@Injectable()
export class UserRepository extends BaseRepository<
  User,
  CreateUserRow,
  UpdateUserRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.users');
  }

  protected mapRow(row: Record<string, unknown>): User {
    const data = row as UserRow;
    return {
      id: data.id,
      email: data.email,
      passwordHash: data.password_hash,
      firstName: data.first_name,
      lastName: data.last_name,
      isVerified: data.is_verified,
      isSystemAdmin: data.is_system_admin,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async createPasswordReset(
    input: CreatePasswordResetInput,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `INSERT INTO public.password_resets (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.token, input.expiresAt],
      options,
    );
  }

  async findPasswordResetByToken(
    token: string,
    options?: QueryOptions,
  ): Promise<PasswordReset | null> {
    const result = await this.executeQuery<PasswordResetRow>(
      `SELECT * FROM public.password_resets 
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token],
      options,
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
    };
  }

  async markPasswordResetUsed(
    resetId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      'UPDATE public.password_resets SET used_at = NOW() WHERE id = $1',
      [resetId],
      options,
    );
  }
}
