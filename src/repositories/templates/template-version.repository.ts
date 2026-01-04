import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../base/base.repository';
import { DatabaseService } from '../../database/database.service';
import { QueryOptions } from '../base/repository.interface';
import {
  TemplateField,
  TemplateVersion,
} from 'src/modules/templates/entities/template-version.entity';

type TemplateVersionRow = {
  id: string;
  template_id: string;
  version: string;
  fields: string | TemplateField[];
  file_url: string;
  changelog: string | null;
  metadata: string | Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
};

@Injectable()
export class TemplateVersionRepository extends BaseRepository<TemplateVersion> {
  private readonly SORTABLE_FIELDS = ['version', 'created_at'] as const;

  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.template_versions');
  }

  async findMany(
    filters: { template_id?: string; version?: string },
    _pagination: { page: number; limit: number } = { page: 1, limit: 50 },
    sortBy: (typeof this.SORTABLE_FIELDS)[number] = 'created_at',
    options?: QueryOptions,
  ): Promise<{ data: TemplateVersion[]; total: number }> {
    // Validate sortBy against whitelist
    if (!this.SORTABLE_FIELDS.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }

    // Build query with filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.template_id) {
      params.push(filters.template_id);
      conditions.push(`template_id = $${params.length}`);
    }
    if (filters.version) {
      params.push(filters.version);
      conditions.push(`version = $${params.length}`);
    }

    const orderBy = `ORDER BY ${sortBy} DESC`;

    // pagination --------------------------

    // Execute query
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query =
      `SELECT * FROM ${this.tableName} ${whereClause} ${orderBy}`.trim();
    const result = await this.executeQuery<TemplateVersionRow>(
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

  protected mapRow(row: Record<string, unknown>): TemplateVersion {
    const data = row as TemplateVersionRow;
    return {
      id: data.id,
      template_id: data.template_id,
      version: data.version,
      fields: data.fields as TemplateField[],
      file_url: data.file_url,
      changelog: data.changelog,
      metadata: data.metadata as Record<string, unknown>,
      is_active: data.is_active,
      created_by: data.created_by,
      created_at: data.created_at,
    };
  }

  async deactivateAllVersions(
    templateId: string,
    options?: QueryOptions,
  ): Promise<void> {
    await this.executeQuery(
      `UPDATE ${this.tableName} SET is_active = false WHERE template_id = $1`,
      [templateId],
      options,
    );
  }
}
