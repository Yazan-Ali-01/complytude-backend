import { Injectable, NotImplementedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type {
  DeleteDocumentResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
  ListDocumentsQueryDto,
  PreviewDocumentDto,
  PreviewDocumentResponseDto,
} from './dto';

/**
 * Documents Service
 *
 * This is a stub service for API contract definition.
 * All methods throw NotImplementedException and will be implemented in the business logic phase.
 */
@Injectable()
export class DocumentsService {
  /**
   * Generate a temporary preview document
   */
  preview(
    _dto: PreviewDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<PreviewDocumentResponseDto> {
    throw new NotImplementedException(
      'Document preview generation not yet implemented',
    );
  }

  /**
   * Generate and save a permanent document
   */
  generate(
    _dto: GenerateDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto> {
    throw new NotImplementedException(
      'Document generation not yet implemented',
    );
  }

  /**
   * List all documents for the authenticated user's tenant
   */
  findAll(
    _query: ListDocumentsQueryDto,
    _user: AuthenticatedUser,
  ): Promise<DocumentListResponseDto> {
    throw new NotImplementedException('Document listing not yet implemented');
  }

  /**
   * Get a single document by ID with full details
   */
  findOne(_id: string, _user: AuthenticatedUser): Promise<DocumentResponseDto> {
    throw new NotImplementedException('Document retrieval not yet implemented');
  }

  /**
   * Soft-delete a document
   */
  remove(
    _id: string,
    _user: AuthenticatedUser,
  ): Promise<DeleteDocumentResponseDto> {
    throw new NotImplementedException('Document deletion not yet implemented');
  }
}
