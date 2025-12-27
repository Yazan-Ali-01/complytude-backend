import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  CreateTemplateInput,
  PaginatedTemplates,
  PaginationOptions,
  Template,
  TemplateFilters,
  TemplateStatus,
  UpdateTemplateInput,
} from './interfaces/template.interfaces';

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

  async findByKey(
    key: string,
    options?: QueryOptions,
  ): Promise<Template | null> {
    return this.findOne({ ...options, filters: { key } });
  }

  async findAllTemplates(
    filters: TemplateFilters = {},
    paginationOptions: PaginationOptions = {},
    options?: QueryOptions,
  ): Promise<PaginatedTemplates> {
    const { offset = 1, limit = 50 } = paginationOptions;
    const result = await this.findAll({
      ...options,
      filters,
      operators: {
        languages: 'ANY', // languages = ANY(language)
      },
      limit: limit,
      offset: offset,
    });

    return { data: result.data, total: result.total };
  }

  async createTemplate(
    input: CreateTemplateInput,
    options?: QueryOptions,
  ): Promise<Template> {
    const payload: CreateTemplateRow = {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      category_id: input.category_id ?? null,
      authority_id: input.authority_id ?? null,
      languages: input.languages,
      current_version: input.current_version ?? '1.0.0',
      status: input.status ?? 'active',
      file_url: input.file_url ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      created_by: input.created_by ?? null,
    };

    return this.create(payload, options);
  }

  async updateByKey(
    key: string,
    data: UpdateTemplateInput,
    options?: QueryOptions,
  ): Promise<Template> {
    const entries: Array<[string, unknown]> = Object.entries({
      name: data.name,
      description:
        data.description === undefined ? undefined : (data.description ?? null),
      category_id:
        data.category_id === undefined ? undefined : data.category_id,
      authority_id:
        data.authority_id === undefined ? undefined : data.authority_id,
      languages: data.languages,
      current_version: data.current_version,
      status: data.status,
      file_url:
        data.file_url === undefined ? undefined : (data.file_url ?? null),
      thumbnail_url:
        data.thumbnail_url === undefined
          ? undefined
          : (data.thumbnail_url ?? null),
      metadata:
        data.metadata === undefined ? undefined : JSON.stringify(data.metadata),
    }).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
      throw new Error('No data provided for update');
    }

    entries.push(['updated_at', data.updated_at ?? new Date()]);

    const setClause = entries
      .map(([column], idx) => `${column} = $${idx + 1}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET ${setClause} WHERE key = $${
        entries.length + 1
      } RETURNING *`,
      [...values, key],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(`Template with key ${key} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  async updateById(
    id: string,
    data: UpdateTemplateInput,
    options?: QueryOptions,
  ): Promise<Template> {
    const entries: Array<[string, unknown]> = Object.entries({
      name: data.name,
      description:
        data.description === undefined ? undefined : (data.description ?? null),
      category_id:
        data.category_id === undefined ? undefined : data.category_id,
      authority_id:
        data.authority_id === undefined ? undefined : data.authority_id,
      languages: data.languages,
      current_version: data.current_version,
      status: data.status,
      file_url:
        data.file_url === undefined ? undefined : (data.file_url ?? null),
      thumbnail_url:
        data.thumbnail_url === undefined
          ? undefined
          : (data.thumbnail_url ?? null),
      metadata:
        data.metadata === undefined ? undefined : JSON.stringify(data.metadata),
    }).filter(([, value]) => value !== undefined);

    if (entries.length === 0) {
      throw new Error('No data provided for update');
    }

    entries.push(['updated_at', data.updated_at ?? new Date()]);

    const setClause = entries
      .map(([column], idx) => `${column} = $${idx + 1}`)
      .join(', ');
    const values = entries.map(([, value]) => value);

    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = $${
        entries.length + 1
      } RETURNING *`,
      [...values, id],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(`Template with id ${id} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  async updateStatus(
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

  async updateCurrentVersion(
    templateId: string,
    version: string,
    fileUrl?: string,
    options?: QueryOptions,
  ): Promise<Template> {
    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET current_version = $1, file_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [version, fileUrl ?? null, templateId],
      options,
    );

    if (!result.rows.length) {
      throw new NotFoundException(
        `Template with id ${templateId} not found for version update`,
      );
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
