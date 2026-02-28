import { BaseRepository, QueryOptions } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

/**
 * Document entity returned from queries.
 */
export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: Record<string, any>;
  template_key: string | null;
  template_version: string | null;
  generation_metadata: Record<string, any> | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Type for creating a new document row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type CreateDocumentRow = {
  id: string;
  tenant_id: string;
  title: string;
  content?: string | null;
  metadata: string; // Stringified JSONB
  template_key?: string | null;
  template_version?: string | null;
  generation_metadata?: string; // Stringified JSONB
  created_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/**
 * Type for updating an existing document row in the database.
 * JSON/JSONB fields must be pre-stringified.
 */
export type UpdateDocumentRow = {
  title?: string;
  content?: string | null;
  metadata?: string; // Stringified JSONB
  template_key?: string | null;
  template_version?: string | null;
  generation_metadata?: string; // Stringified JSONB
  updated_at?: Date;
};

type DocumentRow = {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  metadata: string | Record<string, unknown>;
  template_key: string | null;
  template_version: string | null;
  generation_metadata: string | Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Repository for managing Document entities in tenant-specific schemas.
 * Handles database operations for documents stored in dynamically named schemas.
 *
 * Unlike other repositories, this one operates on tables in tenant schemas
 * (e.g., tenant_abc.documents) rather than public schema tables.
 */
@Injectable()
export class DocumentRepository extends BaseRepository<
  Document,
  CreateDocumentRow,
  UpdateDocumentRow
> {
  constructor(databaseService: DatabaseService) {
    // Note: tableName will be overridden per-query with schema-qualified name
    super(databaseService, 'documents');
  }

  /**
   * Get the list of columns to select in queries.
   */
  protected getSelectColumns(): string {
    return 'id, tenant_id, title, content, metadata, template_key, template_version, generation_metadata, created_by, created_at, updated_at';
  }

  /**
   * Map a database row to a Document domain entity.
   * Parses JSON/JSONB string fields back into objects.
   *
   * @param row - Raw database row
   * @returns Mapped Document entity
   */
  protected mapRow(row: Record<string, unknown>): Document {
    const data = row as DocumentRow;
    return {
      id: data.id,
      tenant_id: data.tenant_id,
      title: data.title,
      content: data.content,
      metadata:
        typeof data.metadata === 'string'
          ? JSON.parse(data.metadata)
          : (data.metadata as Record<string, any>),
      template_key: data.template_key,
      template_version: data.template_version,
      generation_metadata:
        data.generation_metadata === null
          ? null
          : typeof data.generation_metadata === 'string'
            ? JSON.parse(data.generation_metadata)
            : (data.generation_metadata as Record<string, any>),
      created_by: data.created_by,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Create a document in a tenant-specific schema.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param data - Document data with JSON fields pre-stringified
   * @param options - Query options
   * @returns Created Document entity
   */
  async createInSchema(
    schemaName: string,
    data: CreateDocumentRow,
    options?: QueryOptions,
  ): Promise<Document> {
    const keys = Object.keys(data as Record<string, unknown>);
    const values = Object.values(data as Record<string, unknown>);

    if (keys.length === 0) {
      throw new Error('No data provided for create');
    }

    const columns = keys.join(', ');
    const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;

    const query = `
      INSERT INTO ${schemaQualifiedTable} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.executeQuery(query, values, options);
    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Update a document in a tenant-specific schema by ID.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param id - The document ID
   * @param data - Document data with JSON fields pre-stringified
   * @param options - Query options
   * @returns Updated Document entity
   */
  async updateInSchema(
    schemaName: string,
    id: string,
    data: UpdateDocumentRow,
    options?: QueryOptions,
  ): Promise<Document> {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    );

    if (entries.length === 0) {
      throw new Error('No data provided for update');
    }

    const setClause = entries
      .map(([key], idx) => `${key} = $${idx + 2}`)
      .join(', ');
    const values = entries.map(([, value]) => value);
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;

    const query = `
      UPDATE ${schemaQualifiedTable}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, [id, ...values], options);
    if (result.rows.length === 0) {
      throw new Error(
        `Document with ID ${id} not found in ${schemaQualifiedTable}`,
      );
    }

    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  /**
   * Find a document by ID in a tenant-specific schema.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param id - The document ID
   * @param options - Query options
   * @returns Document entity or null if not found
   */
  async findByIdInSchema(
    schemaName: string,
    id: string,
    options?: QueryOptions,
  ): Promise<Document | null> {
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;
    const columns = this.getSelectColumns();
    const result = await this.executeQuery(
      `SELECT ${columns} FROM ${schemaQualifiedTable} WHERE id = $1`,
      [id],
      options,
    );

    return result.rows[0]
      ? this.mapRow(result.rows[0] as Record<string, unknown>)
      : null;
  }

  /**
   * Delete a document by ID in a tenant-specific schema.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param id - The document ID
   * @param options - Query options
   * @returns Number of rows deleted (0 if not found)
   */
  async deleteInSchema(
    schemaName: string,
    id: string,
    options?: QueryOptions,
  ): Promise<number> {
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;
    const result = await this.executeQuery(
      `DELETE FROM ${schemaQualifiedTable} WHERE id = $1`,
      [id],
      options,
    );

    return result.rowCount ?? 0;
  }

  /**
   * Find documents by template key in a tenant-specific schema.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param templateKey - The template key to filter by
   * @param options - Query options
   * @returns Array of Document entities
   */
  async findByTemplateKeyInSchema(
    schemaName: string,
    templateKey: string,
    options?: QueryOptions,
  ): Promise<Document[]> {
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;
    const columns = this.getSelectColumns();
    const result = await this.executeQuery<DocumentRow>(
      `SELECT ${columns} FROM ${schemaQualifiedTable} WHERE template_key = $1 ORDER BY created_at DESC`,
      [templateKey],
      options,
    );

    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>),
    );
  }

  /**
   * Find all documents in a tenant-specific schema.
   *
   * @param schemaName - The tenant schema name (e.g., 'tenant_abc')
   * @param options - Query options
   * @returns Array of Document entities
   */
  async findAllInSchema(
    schemaName: string,
    options?: QueryOptions,
  ): Promise<Document[]> {
    const schemaQualifiedTable = `"${schemaName}".${this.tableName}`;
    const columns = this.getSelectColumns();
    const result = await this.executeQuery<DocumentRow>(
      `SELECT ${columns} FROM ${schemaQualifiedTable} ORDER BY created_at DESC`,
      [],
      options,
    );

    return result.rows.map((row) =>
      this.mapRow(row as Record<string, unknown>),
    );
  }
}
