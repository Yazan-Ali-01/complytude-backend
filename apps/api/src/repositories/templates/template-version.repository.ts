import {
  BaseRepository,
  CursorPaginationHelper,
  CursorPaginationOptions,
  CursorPaginationResult,
  DatabaseService,
  QueryOptions,
} from '@lib/database';
import { Injectable } from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
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
  metadata: string; // Stringified JSONB object
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
  metadata?: string; // Stringified JSONB object
  is_active?: boolean;
};

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
  constructor(databaseService: DatabaseService, @I18n() i18n: I18nService) {
    super(databaseService, 'public.template_versions', i18n);
  }

  /**
   * Find template versions with cursor-based pagination.
   * Supports filtering by template_id and version.
   *
   * @param filters - Optional filters for template_id and version
   * @param cursorOptions - Cursor, limit, and direction for pagination
   * @param options - Query options (tenant context, client, etc.)
   * @returns Cursor-paginated results with navigation metadata
   */
  async findMany(
    filters: { template_id?: string; version?: string } = {},
    cursorOptions?: CursorPaginationOptions,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<TemplateVersion>> {
    // Validate and normalize cursor options
    const { cursor, limit, direction } =
      CursorPaginationHelper.validateOptions(cursorOptions);

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

    // Add cursor condition using helper
    const cursorQuery = CursorPaginationHelper.buildCursorQuery(
      direction,
      cursor,
      params.length + 1,
    );

    if (cursorQuery.clause) {
      conditions.push(cursorQuery.clause);
      params.push(...cursorQuery.params);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limitClause = CursorPaginationHelper.buildLimitClause(
      limit,
      params.length + 1,
    );
    params.push(...limitClause.params);

    const query =
      `SELECT ${this.getSelectColumns()} FROM ${this.tableName} ${whereClause} ${cursorQuery.orderClause} ${limitClause.clause}`.trim();
    const result = await this.executeQuery<TemplateVersionRow>(
      query,
      params,
      options,
    );

    const mappedRows = result.rows.map((row) => this.mapRow(row));

    return CursorPaginationHelper.createPaginationResponse(
      mappedRows,
      limit,
      direction,
      !!cursor,
    );
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, template_id, version, fields, file_url, changelog, metadata, is_active, created_by, created_at';
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
      metadata: data.metadata as Record<string, unknown>,
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
