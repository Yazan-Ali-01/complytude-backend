import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@complytude/shared';
import { DocumentSummaryDto } from './document-response.dto';

/**
 * Paginated response DTO for document list
 * Returns list of documents with pagination metadata
 */
export class DocumentListResponseDto extends PaginatedResponseDto<DocumentSummaryDto> {
  @ApiProperty({
    description: 'Array of documents',
    type: [DocumentSummaryDto],
  })
  declare data: DocumentSummaryDto[];
}
