import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Document } from './entities/document.entity';
import {
  DocumentResponseDto,
  ListDocumentsResponseDto,
} from './dto/document-response.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Find all documents for a tenant with pagination and filters
   */
  async findAll(
    tenantId: string,
    schemaName: string,
    filters: ListDocumentsDto,
    user: AuthenticatedUser & { isSystemAdmin?: boolean },
  ): Promise<ListDocumentsResponseDto> {
    const isAdmin = user?.isSystemAdmin || user?.role === 'admin';

    // Build query with filters - exclude soft-deleted documents
    let query = `SELECT * FROM ${schemaName}.documents WHERE deleted_at IS NULL`;
    const params: any[] = [];

    if (filters.templateKey) {
      params.push(filters.templateKey);
      query += ` AND template_key = $${params.length}`;
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      query += ` AND created_at >= $${params.length}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      query += ` AND created_at <= $${params.length}`;
    }

    // Non-admin users can only see documents they created
    if (!isAdmin) {
      params.push(user.userId);
      query += ` AND created_by = $${params.length}`;
    }

    const countResult = await this.databaseService.queryWithTenantContext(
      tenantId,
      schemaName,
      `SELECT COUNT(*) as count FROM (${query}) as filtered`,
      params,
    );
    const total = parseInt(countResult.rows[0].count as string, 10);

    // pagination and ordering with limit and offset
    const offset = (filters.page - 1) * filters.limit;
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(filters.limit, offset);

    const result = await this.databaseService.queryWithTenantContext<Document>(
      tenantId,
      schemaName,
      query,
      params,
    );

    // Transform to DTOs (exclude content for list view)
    const documents: DocumentResponseDto[] = result.rows.map((doc) =>
      this.transformToDto(doc, false),
    );

    return {
      documents,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  /**
   * Find a single document by ID
   */
  async findOne(
    tenantId: string,
    schemaName: string,
    documentId: string,
    user: AuthenticatedUser & { isSystemAdmin?: boolean },
  ): Promise<DocumentResponseDto> {
    const isAdmin = user?.isSystemAdmin || user?.role === 'admin';
    const query = `SELECT * FROM ${schemaName}.documents WHERE id = $1 AND deleted_at IS NULL`;
    const result = await this.databaseService.queryWithTenantContext<Document>(
      tenantId,
      schemaName,
      query,
      [documentId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Check if user has access to this document
    if (!isAdmin && result.rows[0].created_by !== user.userId) {
      throw new ForbiddenException('You do not have access to this document');
    }

    // Include content in single document view
    return this.transformToDto(result.rows[0], true);
  }

  /**
   * Delete a document by ID
   */
  async delete(
    tenantId: string,
    schemaName: string,
    documentId: string,
    userId: string,
  ): Promise<void> {
    // First check if document exists and is not already deleted
    const checkQuery = `SELECT id FROM ${schemaName}.documents WHERE id = $1 AND deleted_at IS NULL`;
    const checkResult =
      await this.databaseService.queryWithTenantContext<Document>(
        tenantId,
        schemaName,
        checkQuery,
        [documentId],
      );

    if (checkResult.rows.length === 0) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Soft delete the document
    const deleteQuery = `
      UPDATE ${schemaName}.documents 
      SET deleted_at = NOW(), deleted_by = $2 
      WHERE id = $1
    `;
    await this.databaseService.queryWithTenantContext(
      tenantId,
      schemaName,
      deleteQuery,
      [documentId, userId],
    );
  }

  /**
   * Transform database document to DTO
   */
  private transformToDto(
    doc: Document,
    includeContent: boolean,
  ): DocumentResponseDto {
    return {
      id: doc.id,
      tenantId: doc.tenant_id,
      title: doc.title,
      content: includeContent ? doc.content : undefined,
      templateKey: doc.template_key,
      metadata: doc.metadata || {},
      generationMetadata: doc.generation_metadata || {},
      createdBy: doc.created_by,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
