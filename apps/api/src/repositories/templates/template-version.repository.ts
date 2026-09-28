import {
  BaseRepository,
  DatabaseService,
  OffsetPaginationOptions,
  OffsetPaginationResult,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import {
  TemplateField,
  TemplateVersion,
} from 'src/modules/templates/entities/template-version.entity';

/**
 * Type for creating a new template version row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type CreateTemplateVersionRow = {
  id?: string;
  template_id: string;
  version: string;
  fields: string; // Stringified JSONB array
  file_url: string;
  changelog?: string | null;
  is_active?: boolean;
  created_by?: string | null;
  created_at?: Date;
};

/**
 * Type for updating an existing template version row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type UpdateTemplateVersionRow = {
  version?: string;
  fields?: string; // Stringified JSONB array
  file_url?: string;
  changelog?: string | null;
  is_active?: boolean;
};

type TemplateVersionRow = {
  id: string;
  template_id: string;
  version: string;
  fields: string | TemplateField[];
  file_url: string;
  changelog: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
};

/**
 * Repository for managing Template Version entities.
 * Handles database operations for versioning of compliance templates.
 */
@Injectable()
export class TemplateVersionRepository extends BaseRepository<
  TemplateVersion,
  CreateTemplateVersionRow,
  UpdateTemplateVersionRow
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'public.template_versions');
  }

  /** A template's versions, page by page, newest first. */
  async findMany(
    filters: { template_id: string },
    pagination: OffsetPaginationOptions = { page: 1, limit: 20 },
    options?: QueryOptions,
  ): Promise<OffsetPaginationResult<TemplateVersion>> {
    const countResult = await this.executeQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.tableName} WHERE template_id = $1`,
      [filters.template_id],
      options,
    );
    const total = parseInt(countResult.rows[0].count, 10);
    const offset = (pagination.page - 1) * pagination.limit;

    const dataResult = await this.executeQuery<TemplateVersionRow>(
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} WHERE template_id = $1
       ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [filters.template_id, pagination.limit, offset],
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

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, template_id, version, fields, file_url, changelog, is_active, created_by, created_at';
  }

  /**
   * Map a database row to a TemplateVersion domain entity.
   *
   * @param row - Raw database row
   * @returns Mapped TemplateVersion entity
   */
  protected mapRow(row: Record<string, unknown>): TemplateVersion {
    const data = row as TemplateVersionRow;
    return {
      id: data.id,
      template_id: data.template_id,
      version: data.version,
      fields: data.fields as TemplateField[],
      file_url: data.file_url,
      changelog: data.changelog,
      is_active: data.is_active,
      created_by: data.created_by,
      created_at: data.created_at,
    };
  }

  /**
   * Deactivate all versions for a specific template.
   * Used when setting a new active version or deactivating the template.
   *
   * @param templateId - The ID of the template
   * @param options - Query options
   */
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
