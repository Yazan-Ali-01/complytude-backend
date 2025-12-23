import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentMetadataDto {
  @ApiPropertyOptional({ example: 1024000, description: 'File size in bytes' })
  size?: number;

  @ApiPropertyOptional({ example: 'application/pdf', description: 'MIME type' })
  contentType?: string;

  @ApiPropertyOptional({
    example: 'contract_2024_01_15.pdf',
    description: 'Filename',
  })
  filename?: string;
}

export class DocumentGenerationMetadataDto {
  @ApiPropertyOptional({
    example: { companyName: 'Acme Corp', contractDate: '2024-01-15' },
    description: 'Variables used for document generation',
  })
  variables?: Record<string, any>;

  @ApiPropertyOptional({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Generation timestamp',
  })
  generatedAt?: string;

  @ApiPropertyOptional({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Template ID',
  })
  templateId?: string;
}

export class DocumentResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Document ID',
  })
  id: string;

  @ApiProperty({
    example: 'tenant_123e4567-e89b-12d3-a456-426614174000',
    description: 'Tenant ID',
  })
  tenantId: string;

  @ApiProperty({
    example: 'Employment Contract - John Doe',
    description: 'Document title',
  })
  title: string;

  @ApiPropertyOptional({
    example: 'This is the document content...',
    description: 'Document content (may be omitted in list views)',
  })
  content?: string;

  @ApiPropertyOptional({
    example: 'contract_template_v1',
    description: 'Template key',
  })
  templateKey?: string;

  @ApiProperty({ type: DocumentMetadataDto })
  metadata: DocumentMetadataDto;

  @ApiProperty({ type: DocumentGenerationMetadataDto })
  generationMetadata: DocumentGenerationMetadataDto;

  @ApiPropertyOptional({
    example: 'user_123e4567-e89b-12d3-a456-426614174000',
    description: 'User who created the document',
  })
  createdBy?: string;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}

export class DocumentListResponseDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  documents: DocumentResponseDto[];

  @ApiProperty({ example: 25, description: 'Total number of documents' })
  total: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 50, description: 'Items per page' })
  limit: number;
}
