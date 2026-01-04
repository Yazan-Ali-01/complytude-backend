import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import { Template } from 'src/modules/templates/entities/template.entity';

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: Template['status'];
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: string | Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class TemplateRepository extends BaseRepository<Template> {
  private readonly SORTABLE_FIELDS = [
    'name',
    'created_at',
    'updated_at',
  ] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.templates');
  }

  async findMany(
    filters: {
      status?: string;
      categoryId?: string;
      authorityId?: string;
      language?: string;
    },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'created_at',
    options?: QueryOptions,
  ): Promise<{ data: Template[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.categoryId) {
      params.push(filters.categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (filters.authorityId) {
      params.push(filters.authorityId);
      conditions.push(`authority_id = $${params.length}`);
    }
    if (filters.language) {
      params.push(filters.language);
      conditions.push(`$4 = ANY(languages)`);
    }

    const orderBy = `ORDER BY ${sortBy} ASC`;

    //pagination

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<TemplateRow>(query, params, options);

    // Count total
    const totalQuery = `SELECT COUNT(*) FROM ${this.tableName} ${whereClause}`;
    const totalResult = await this.executeQuery(totalQuery, params, options);

    return {
      data: result.rows.map((row) => this.mapRow(row)),
      total: parseInt(totalResult.rows[0].count as string, 10),
    };
  }

  async findActive(options?: QueryOptions): Promise<Template[]> {
    const result = await this.findMany(
      { status: 'active' },
      { page: 1, limit: 1000 },
      'name',
      options,
    );
    return result.data;
  }

  protected mapRow(row: Record<string, unknown>): Template {
    const data = row as TemplateRow;
    return {
      id: data.id,
      key: data.key,
      name: data.name,
      description: data.description,
      category_id: data.category_id,
      authority_id: data.authority_id,
      languages: data.languages,
      current_version: data.current_version,
      status: data.status,
      file_url: data.file_url,
      thumbnail_url: data.thumbnail_url,
      metadata: data.metadata as Record<string, unknown>,
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateStatusByKey(
    key: string,
    status: Template['status'],
    options?: QueryOptions,
  ): Promise<Template> {
    const result = await this.executeQuery<TemplateRow>(
      `UPDATE ${this.tableName} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *`,
      [status, key],
      options,
    );

    if (!result.rows.length) {
      throw new Error(`Template with key ${key} not found`);
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
      throw new Error(`Template with key ${key} not found`);
    }
  }
}
