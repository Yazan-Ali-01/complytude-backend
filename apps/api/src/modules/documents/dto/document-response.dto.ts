import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Document response DTO for list endpoints (summary view)
 */
export class DocumentSummaryDto {
  @ApiProperty({
    description: 'Document unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Document title',
    example: 'Employment Contract - John Doe',
  })
  title: string;

  @ApiProperty({
    description: 'How the document was created',
    example: 'file_upload',
    enum: ['text_input', 'file_upload'],
  })
  sourceType: string;

  @ApiPropertyOptional({
    description: 'Original filename (file_upload documents only)',
    example: 'employment-contract.pdf',
    nullable: true,
  })
  originalFilename: string | null;

  @ApiPropertyOptional({
    description: 'MIME type (file_upload documents only)',
    example: 'application/pdf',
    nullable: true,
  })
  mimeType: string | null;

  @ApiPropertyOptional({
    description: 'File size in bytes (file_upload documents only)',
    example: 45678,
    nullable: true,
  })
  fileSizeBytes: number | null;

  @ApiPropertyOptional({
    description: 'Text extraction status (file_upload documents only)',
    example: 'completed',
    nullable: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  extractionStatus: string | null;

  @ApiPropertyOptional({
    description: 'User ID who created the document',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  createdBy: string | null;

  @ApiProperty({
    description: 'Document creation timestamp',
    example: '2026-01-21T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Document last update timestamp',
    example: '2026-01-21T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}

/**
 * Full document response DTO for single document retrieval
 */
export class DocumentResponseDto {
  @ApiProperty({
    description: 'Document unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Document title',
    example: 'Employment Contract - John Doe',
  })
  title: string;

  @ApiPropertyOptional({
    description:
      'Document text content (for text_input, or extracted text for file_upload)',
    example: null,
    nullable: true,
  })
  content: string | null;

  @ApiProperty({
    description: 'Additional document metadata',
    example: {},
  })
  metadata: Record<string, unknown>;

  @ApiProperty({
    description: 'How the document was created',
    example: 'file_upload',
    enum: ['text_input', 'file_upload'],
  })
  sourceType: string;

  @ApiPropertyOptional({
    description: 'S3 object key (file_upload documents only)',
    example: 'tenants/abc/documents/123/contract.pdf',
    nullable: true,
  })
  s3Key: string | null;

  @ApiPropertyOptional({
    description: 'S3 bucket name (file_upload documents only)',
    example: 'complytude-quarantine',
    nullable: true,
  })
  s3Bucket: string | null;

  @ApiPropertyOptional({
    description: 'Original filename (file_upload documents only)',
    example: 'employment-contract.pdf',
    nullable: true,
  })
  originalFilename: string | null;

  @ApiPropertyOptional({
    description: 'File size in bytes (file_upload documents only)',
    example: 45678,
    nullable: true,
  })
  fileSizeBytes: number | null;

  @ApiPropertyOptional({
    description: 'MIME type (file_upload documents only)',
    example: 'application/pdf',
    nullable: true,
  })
  mimeType: string | null;

  @ApiPropertyOptional({
    description: 'Text extraction status (file_upload documents only)',
    example: 'completed',
    nullable: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  extractionStatus: string | null;

  @ApiPropertyOptional({
    description: 'Extraction error message (if extraction failed)',
    example: null,
    nullable: true,
  })
  extractionError: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp when text extraction completed',
    example: null,
    nullable: true,
    type: 'string',
    format: 'date-time',
  })
  extractedAt: string | null;

  @ApiPropertyOptional({
    description: 'User ID who created the document',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  createdBy: string | null;

  @ApiProperty({
    description: 'Document creation timestamp',
    example: '2026-01-21T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Document last update timestamp',
    example: '2026-01-21T10:30:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: string;
}

/**
 * Response DTO for document download URL
 */
export class DocumentDownloadUrlResponseDto {
  @ApiProperty({
    description: 'Pre-signed download URL (time-limited)',
    example: 'https://s3.amazonaws.com/complytude-files/tenants/...',
  })
  url: string;

  @ApiProperty({
    description: 'URL expiration timestamp',
    example: '2026-04-01T18:15:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  expiresAt: string;
}

/**
 * Response DTO for document deletion
 */
export class DeleteDocumentResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Document deleted successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Deleted document ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Deletion timestamp',
    example: '2026-01-21T11:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  deletedAt: string;
}
