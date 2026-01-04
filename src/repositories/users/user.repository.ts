import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  CreatePasswordResetInput,
  PasswordReset,
} from './interfaces/user.interfaces';
import { User } from 'src/modules/users/entities/user.entity';

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

type PasswordResetRow = {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
};

@Injectable()
export class UserRepository extends BaseRepository<User> {
  private readonly SORTABLE_FIELDS = [
    'email',
    'first_name',
    'last_name',
    'created_at',
    'updated_at',
  ] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.users');
  }

  async findMany(
    filters: {
      email?: string;
      is_verified?: boolean;
      is_system_admin?: boolean;
    },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'created_at',
    options?: QueryOptions,
  ): Promise<{ data: User[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.email) {
      params.push(filters.email);
      conditions.push(`email ILIKE $${params.length}`);
    }
    if (filters.is_verified !== undefined) {
      params.push(filters.is_verified);
      conditions.push(`is_verified = $${params.length}`);
    }
    if (filters.is_system_admin !== undefined) {
      params.push(filters.is_system_admin);
      conditions.push(`is_system_admin = $${params.length}`);
    }

    const orderBy = `ORDER BY ${sortBy} ASC`;

    //pagination

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<UserRow>(query, params, options);

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<User[]> {
    const result = await this.findMany(
      { is_verified: true },
      { page: 1, limit: 1000 },
      'email',
      options,
    );
    return result.data;
  }

  protected mapRow(row: Record<string, unknown>): User {
    const data = row as UserRow;
    return {
      id: data.id,
      email: data.email,
      password_hash: data.password_hash,
      first_name: data.first_name,
      last_name: data.last_name,
      is_verified: data.is_verified,
      is_system_admin: data.is_system_admin,
      created_at: data.created_at,
      updated_at: data.updated_at,
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
