import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Nested user object for created by information
 */
export class UserSummaryDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'User first name',
    example: 'John',
    nullable: true,
  })
  firstName: string | null;

  @ApiPropertyOptional({
    description: 'User last name',
    example: 'Doe',
    nullable: true,
  })
  lastName: string | null;
}

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
    description: 'Template key used for generation',
    example: 'dmcc_employment_v1',
  })
  templateKey: string;

  @ApiProperty({
    description: 'Template version used for generation',
    example: '1.0.0',
  })
  templateVersion: string;

  @ApiProperty({
    description: 'Whether the document is soft-deleted',
    example: false,
  })
  isDeleted: boolean;

  @ApiProperty({
    description: 'User ID who created the document',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  createdBy: string;

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
    description: 'Document text content (reserved for future text extraction)',
    example: null,
    nullable: true,
  })
  content: string | null;

  @ApiProperty({
    description: 'Additional document metadata',
    example: {
      originalFilename: 'employment-contract.docx',
      fileSize: 45678,
    },
  })
  metadata: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Template ID used for generation',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  templateId: string | null;

  @ApiProperty({
    description: 'Template key used for generation',
    example: 'dmcc_employment_v1',
  })
  templateKey: string;

  @ApiPropertyOptional({
    description: 'Template version ID used for generation',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
  })
  templateVersionId: string | null;

  @ApiProperty({
    description: 'Template version used for generation',
    example: '1.0.0',
  })
  templateVersion: string;

  @ApiProperty({
    description: 'Metadata about document generation process',
    example: {
      variables: { employee_name: 'John Doe', salary: '5000' },
      generatedBy: '550e8400-e29b-41d4-a716-446655440000',
    },
  })
  generationMetadata: Record<string, unknown>;

  @ApiProperty({
    description: 'Signed download URLs for each available format',
    example: {
      docx: 'https://s3.example.com/documents/doc.docx?expires=...',
      pdf: 'https://s3.example.com/documents/doc.pdf?expires=...',
    },
  })
  downloadUrls: Record<string, string>;

  @ApiProperty({
    description: 'Whether the document is soft-deleted',
    example: false,
  })
  isDeleted: boolean;

  @ApiPropertyOptional({
    description: 'Soft-delete timestamp',
    example: null,
    nullable: true,
    type: 'string',
    format: 'date-time',
  })
  deletedAt: string | null;

  @ApiPropertyOptional({
    description: 'User ID who deleted the document',
    example: null,
    nullable: true,
  })
  deletedBy: string | null;

  @ApiProperty({
    description: 'User ID who created the document',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  createdBy: string;

  @ApiProperty({
    description: 'User information for document creator',
    type: UserSummaryDto,
  })
  createdByUser: UserSummaryDto;

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
