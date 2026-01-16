import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Document } from './entities/document.entity';
import { DocumentResponseDto } from './dto/document-response.dto';
import {
  ListDocumentsDto,
  ListDocumentsResponseDto,
} from './dto/list-documents.dto';
import { DocumentRepository } from 'src/repositories/documents/document.repository';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentRepository: DocumentRepository,
  ) {}

  /**
   * Find all documents for a tenant with cursor-based pagination and filters
   */
  async findAll(
    tenantId: string,
    schemaName: string,
    filters: ListDocumentsDto,
    user: AuthenticatedUser,
  ): Promise<ListDocumentsResponseDto> {
    const isAdmin = user?.isSystemAdmin || user?.role === 'admin';

    // Build repository filters
    const repositoryFilters: {
      template_key?: string;
      created_by?: string;
      title?: string;
      start_date?: string;
      end_date?: string;
    } = {};

    if (filters.templateKey) {
      repositoryFilters.template_key = filters.templateKey;
    }

    if (filters.startDate) {
      repositoryFilters.start_date = filters.startDate;
    }

    if (filters.endDate) {
      repositoryFilters.end_date = filters.endDate;
    }

    if (filters.title) {
      repositoryFilters.title = filters.title;
    }

    // Non-admin users can only see documents they created
    if (!isAdmin) {
      repositoryFilters.created_by = user.userId;
    }

    // Use repository with cursor pagination
    const result = await this.documentRepository.findManyInSchema(
      schemaName,
      repositoryFilters,
      {
        cursor: filters.cursor,
        limit: filters.limit,
        direction: filters.direction,
      },
      { tenant: { tenantId, schema: schemaName } },
    );

    // Transform to DTOs (exclude content for list view)
    const documents: DocumentResponseDto[] = result.data.map((doc) =>
      this.transformToDto(doc),
    );

    return {
      documents,
      nextCursor: result.nextCursor,
      prevCursor: result.prevCursor,
      hasNext: result.hasNext,
      hasPrevious: result.hasPrevious,
    };
  }

  /**
   * Find a single document by ID
   */
  async findOne(
    tenantId: string,
    schemaName: string,
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<DocumentResponseDto> {
    const isAdmin = user?.isSystemAdmin || user?.role === 'admin';
    const select = [
      'id',
      'title',
      'template_key',
      'metadata',
      'generation_metadata',
      'created_by',
      'created_at',
      'updated_at',
    ];
    const document = await this.documentRepository.findByIdInSchema(
      schemaName,
      documentId,
      select,
      { tenant: { tenantId, schema: schemaName } },
    );

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Check if user has access to this document
    if (!isAdmin && document.created_by !== user.userId) {
      throw new ForbiddenException('You do not have access to this document');
    }

    // Include content in single document view
    return this.transformToDto(document);
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
    await this.databaseService.transaction(async (client) => {
      const document = await this.documentRepository.findByIdInSchema(
        schemaName,
        documentId,
        ['id', 'created_by'],
        { client, tenant: { tenantId, schema: schemaName } },
      );

      if (!document) {
        throw new NotFoundException(`Document with ID ${documentId} not found`);
      }
      if (document.created_by !== userId) {
        throw new ForbiddenException(
          'You do not have permission to delete this document',
        );
      }

      // Soft delete the document
      await this.documentRepository.softDeleteInSchema(
        schemaName,
        documentId,
        userId,
        { client, tenant: { tenantId, schema: schemaName } },
      );
    });
    // First check if document exists and is not already deleted
  }

  /**
   * Transform database document to DTO
   */
  private transformToDto(doc: Document): DocumentResponseDto {
    return {
      id: doc.id,
      tenantId: doc.tenant_id,
      title: doc.title,
      templateKey: doc.template_key ?? undefined,
      metadata: doc.metadata ?? {},
      generationMetadata: doc.generation_metadata ?? undefined,
      createdBy: doc.created_by ?? undefined,
      createdAt: doc.created_at ?? undefined,
      updatedAt: doc.updated_at ?? undefined,
    };
  }
}
