import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import { Category } from 'src/modules/templates/entities/category.entity';

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  private readonly SORTABLE_FIELDS = [
    'name',
    'code',
    'created_at',
    'updated_at',
  ] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.categories');
  }

  async findMany(
    filters: { is_active?: boolean; parent_id?: string; code?: string },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'name',
    options?: QueryOptions,
  ): Promise<{ data: Category[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.parent_id) {
      params.push(filters.parent_id);
      conditions.push(`parent_id = $${params.length}`);
    }
    if (filters.code) {
      params.push(filters.code);
      conditions.push(`code = $${params.length}`);
    }

    const orderBy = `ORDER BY ${sortBy} ASC`;

    // pagination --------------------------

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<CategoryRow>(query, params, options);

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<Category[]> {
    const result = await this.findMany(
      { is_active: true },
      { page: 1, limit: 1000 },
      'name',
      options,
    );
    return result.data;
  }

  protected mapRow(row: Record<string, unknown>): Category {
    const data = row as CategoryRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      parent_id: data.parent_id,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
