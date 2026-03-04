import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { Category } from 'src/modules/categories/entities/category.entity';

export type CreateCategoryRow = {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
};

export type UpdateCategoryRow = {
  name?: string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
  updated_at?: Date;
};

export interface CategoryFilters {
  isActive?: boolean;
  parentId?: string;
  search?: string;
}

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

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  code: 'code',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

@Injectable()
export class CategoryRepository extends BaseRepository<
  Category,
  CreateCategoryRow,
  UpdateCategoryRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.categories');
  }

  async findMany(
    filters: CategoryFilters = {},
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<Category>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.isActive !== undefined) {
      params.push(filters.isActive);
      conditions.push(`is_active = $${params.length}`);
    }
    if (filters.parentId) {
      params.push(filters.parentId);
      conditions.push(`parent_id = $${params.length}`);
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
    const dataResult = await this.executeQuery<CategoryRow>(
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

  async findActive(options?: QueryOptions): Promise<Category[]> {
    const result = await this.findMany(
      { isActive: true },
      { page: 1, limit: 1000 },
      options,
    );
    return result.data;
  }

  async deactivate(
    id: string,
    options?: QueryOptions,
  ): Promise<Category | null> {
    const result = await this.executeQuery<CategoryRow>(
      `UPDATE ${this.tableName} SET is_active = false WHERE id = $1 RETURNING ${this.getSelectColumns()}`,
      [id],
      options,
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  protected getSelectColumns(): string {
    return 'id, code, name, description, parent_id, is_active, created_at, updated_at';
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
