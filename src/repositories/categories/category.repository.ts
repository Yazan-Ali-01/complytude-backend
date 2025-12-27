import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { FindManyOptions, QueryOptions } from '../base/repository.interface';
import {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './interfaces/category.interfaces';

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

type CreateCategoryRow = {
  code: string;
  name: string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
};

type UpdateCategoryRow = Partial<{
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  updated_at: Date;
}>;

@Injectable()
export class CategoryRepository extends BaseRepository<
  Category,
  CreateCategoryRow,
  UpdateCategoryRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.categories');
  }

  protected mapRow(row: Record<string, unknown>): Category {
    const data = row as CategoryRow;
    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description ?? undefined,
      parent_id: data.parent_id ?? undefined,
      is_active: data.is_active,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async findByCode(
    code: string,
    options?: QueryOptions,
  ): Promise<Category | null> {
    return this.findOne({ ...options, filters: { code: code.toLowerCase() } });
  }

  async findAllCategories(
    activeOnly,
    options?: FindManyOptions,
  ): Promise<Category[]> {
    const filters =
      activeOnly == undefined ? undefined : { is_active: activeOnly };
    return this.findAll({ ...options, filters, orderBy: 'name' });
  }

  async createCategory(
    input: CreateCategoryInput,
    options?: QueryOptions,
  ): Promise<Category> {
    const payload: CreateCategoryRow = {
      code: input.code.toLowerCase(),
      name: input.name,
      description: input.description ?? null,
      parent_id: input.parent_id ?? null,
      is_active: input.is_active ?? true,
    };

    return this.create(payload, options);
  }

  async updateCategory(
    id: string,
    data: UpdateCategoryInput,
    options?: QueryOptions,
  ): Promise<Category> {
    const payload: UpdateCategoryRow = {
      name: data.name,
      description:
        data.description === undefined ? undefined : data.description,
      parent_id: data.parent_id === undefined ? undefined : data.parent_id,
      is_active: data.is_active,
      updated_at: data.updated_at ?? new Date(),
    };

    return this.update(id, payload, options);
  }
}
