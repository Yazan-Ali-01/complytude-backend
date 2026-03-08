import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { Authority } from 'src/modules/authorities/entities/authority.entity';

export type CreateAuthorityRow = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  country?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
};

export type UpdateAuthorityRow = {
  code?: string;
  name?: string;
  description?: string | null;
  country?: string;
  is_active?: boolean;
  updated_at?: Date;
};

export interface AuthorityFilters {
  isActive?: boolean;
  country?: string;
  search?: string;
}

type AuthorityRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  country: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  code: 'code',
  country: 'country',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

@Injectable()
export class AuthorityRepository extends BaseRepository<
  Authority,
  CreateAuthorityRow,
  UpdateAuthorityRow
> {
  constructor(databaseService: DatabaseService, @I18n() i18n: I18nService) {
    super(databaseService, 'public.authorities', i18n);
  }

  async findMany(
    filters: AuthorityFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<Authority>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.isActive !== undefined) {
      params.push(filters.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.country) {
      params.push(filters.country);
      conditions.push(`country = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR code ILIKE $${params.length} OR description ILIKE $${params.length})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params,
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const sortColumn =
      ALLOWED_SORT_COLUMNS[pagination.sortBy ?? ''] ?? 'created_at';
    const sortOrder = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    params.push(pagination.limit, offset);
    const dataResult = await this.executeQuery<AuthorityRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      options,
    );

    const totalPages = Math.ceil(total / pagination.limit);

    return {
      data: dataResult.rows.map((row) => this.mapRow(row)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    };
  }

  async findActive(options?: QueryOptions): Promise<Authority[]> {
    const result = await this.findMany(
      { isActive: true },
      { page: 1, limit: 1000 },
      options,
    );
    return result.data;
  }

  protected getSelectColumns(): string {
    return 'id, code, name, description, country, is_active, created_at, updated_at';
  }

  protected mapRow(row: Record<string, unknown>): Authority {
    const data = row as AuthorityRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      country: data.country,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
