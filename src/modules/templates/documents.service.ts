import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Document } from './entities/document.entity';
import {
  DocumentResponseDto,
  DocumentListResponseDto,
} from './dto/document-response.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Find all documents for a tenant with pagination and filters
   */
  async findAll(
    tenantId: string,
    schemaName: string,
    filters: ListDocumentsDto,
  ): Promise<DocumentListResponseDto> {
    try {
      const { page = 1, limit = 50, templateKey, startDate, endDate } = filters;

      // Build query with filters
      let query = `SELECT * FROM ${schemaName}.documents WHERE 1=1`;
      const params: any[] = [];

      // Filter by template key (stored in metadata JSONB)
      if (templateKey) {
        params.push(templateKey);
        query += ` AND metadata->>'templateKey' = $${params.length}`;
      }

      // Filter by date range
      if (startDate) {
        params.push(startDate);
        query += ` AND created_at >= $${params.length}`;
      }

      if (endDate) {
        params.push(endDate);
        query += ` AND created_at <= $${params.length}`;
      }

      // Get total count
      const countResult = await this.databaseService.queryWithTenantContext(
        tenantId,
        schemaName,
        `SELECT COUNT(*) as count FROM (${query}) as filtered`,
        params,
      );
      const total = parseInt(countResult.rows[0].count as string, 10);

      // Add pagination and ordering
      const offset = (page - 1) * limit;
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      // Execute query
      const result =
        await this.databaseService.queryWithTenantContext<Document>(
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
        page,
        limit,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch documents for tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch documents');
    }
  }

  /**
   * Find a single document by ID
   */
  async findOne(
    tenantId: string,
    schemaName: string,
    documentId: string,
  ): Promise<DocumentResponseDto> {
    try {
      const query = `SELECT * FROM ${schemaName}.documents WHERE id = $1`;
      const result =
        await this.databaseService.queryWithTenantContext<Document>(
          tenantId,
          schemaName,
          query,
          [documentId],
        );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Document with ID ${documentId} not found`);
      }

      // Include content in single document view
      return this.transformToDto(result.rows[0], true);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch document ${documentId} for tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch document');
    }
  }

  /**
   * Delete a document by ID
   */
  async delete(
    tenantId: string,
    schemaName: string,
    documentId: string,
  ): Promise<void> {
    try {
      // First check if document exists
      const checkQuery = `SELECT id FROM ${schemaName}.documents WHERE id = $1`;
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

      // Delete the document
      const deleteQuery = `DELETE FROM ${schemaName}.documents WHERE id = $1`;
      await this.databaseService.queryWithTenantContext(
        tenantId,
        schemaName,
        deleteQuery,
        [documentId],
      );

      this.logger.log(
        `Document ${documentId} deleted successfully for tenant ${tenantId}`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete document ${documentId} for tenant ${tenantId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to delete document');
    }
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
      metadata: doc.metadata || {},
      createdBy: doc.created_by,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    };
  }
}
