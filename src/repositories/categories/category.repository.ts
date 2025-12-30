import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
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
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.categories');
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
