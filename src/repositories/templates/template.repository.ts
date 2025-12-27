import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import { Template, TemplateStatus } from './interfaces/template.interfaces';

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: TemplateStatus;
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: string | Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type CreateTemplateRow = {
  key: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  authority_id?: string | null;
  languages: string[];
  current_version?: string;
  status?: TemplateStatus;
  file_url?: string | null;
  thumbnail_url?: string | null;
  metadata?: string;
  created_by?: string | null;
};

type UpdateTemplateRow = Partial<{
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: TemplateStatus;
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: string;
  updated_at: Date;
}>;

@Injectable()
export class TemplateRepository extends BaseRepository<
  Template,
  CreateTemplateRow,
  UpdateTemplateRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.templates');
  }

  protected mapRow(row: Record<string, unknown>): Template {
    const data = row as TemplateRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description ?? undefined,
      category_id: data.category_id ?? undefined,
      authority_id: data.authority_id ?? undefined,
      languages: data.languages,
      current_version: data.current_version,
      status: data.status,
      file_url: data.file_url ?? undefined,
      thumbnail_url: data.thumbnail_url ?? undefined,
      metadata:
        typeof data.metadata === 'string'
          ? JSON.parse(data.metadata)
          : data.metadata,
      created_by: data.created_by ?? undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateStatusByKey(
    key: string,
    status: TemplateStatus,
    options?: QueryOptions,
  ): Promise<Template> {
    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *`,
      [status, key],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(`Template with key ${key} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  async deleteByKey(key: string, options?: QueryOptions): Promise<void> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE key = $1`,
      [key],
      options,
    );

    if (!result.rowCount) {
      throw new NotFoundException(`Template with key ${key} not found`);
    }
  }
}
