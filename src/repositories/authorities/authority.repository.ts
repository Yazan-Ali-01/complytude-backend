import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import { Authority } from 'src/modules/templates/entities/authority.entity';

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

@Injectable()
export class AuthorityRepository extends BaseRepository<Authority> {
  private readonly SORTABLE_FIELDS = [
    'name',
    'code',
    'country',
    'created_at',
    'updated_at',
  ] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.authorities');
  }

  async findMany(
    filters: { is_active?: boolean; country?: string; code?: string },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'name',
    options?: QueryOptions,
  ): Promise<{ data: Authority[]; total: number }> {
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.country) {
      params.push(filters.country);
      conditions.push(`country = $${params.length}`);
    }
    if (filters.code) {
      params.push(filters.code);
      conditions.push(`code = $${params.length}`);
    }

    // pagination

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY ${sortBy} ASC`.trim();
    const result = await this.executeQuery<AuthorityRow>(
      query,
      params,
      options,
    );

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<Authority[]> {
    const result = await this.findMany(
      { is_active: true },
      { page: 1, limit: 1000 },
      'name',
      options,
    );
    return result.data;
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
