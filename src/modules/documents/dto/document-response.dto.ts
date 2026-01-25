import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserSummaryDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  lastName: string | null;
}

export class DocumentSummaryDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Employment Contract - John Doe' })
  title: string;

  @ApiProperty({ example: 'dmcc_employment_v1' })
  templateKey: string;

  @ApiProperty({ example: '1.0.0' })
  templateVersion: string;

  @ApiProperty({ example: false })
  isDeleted: boolean;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  createdBy: string;

  @ApiProperty({ example: '2026-01-21T10:30:00.000Z', type: 'string', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-21T10:30:00.000Z', type: 'string', format: 'date-time' })
  updatedAt: string;
}

export class DocumentResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  tenantId: string;

  @ApiProperty({ example: 'Employment Contract - John Doe' })
  title: string;

  @ApiPropertyOptional({ description: 'Document text content', example: null, nullable: true })
  content: string | null;

  @ApiProperty({ example: { originalFilename: 'employment-contract.docx', fileSize: 45678 } })
  metadata: Record<string, unknown>;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', nullable: true })
  templateId: string | null;

  @ApiProperty({ example: 'dmcc_employment_v1' })
  templateKey: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', nullable: true })
  templateVersionId: string | null;

  @ApiProperty({ example: '1.0.0' })
  templateVersion: string;

  @ApiProperty({ example: { variables: { employee_name: 'John Doe', salary: '5000' }, generatedBy: '550e8400-e29b-41d4-a716-446655440000' } })
  generationMetadata: Record<string, unknown>;

  @ApiProperty({ example: { docx: 'https://s3.example.com/documents/doc.docx?expires=...', pdf: 'https://s3.example.com/documents/doc.pdf?expires=...' } })
  downloadUrls: Record<string, string>;

  @ApiProperty({ example: false })
  isDeleted: boolean;

  @ApiPropertyOptional({ example: null, nullable: true, type: 'string', format: 'date-time' })
  deletedAt: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedBy: string | null;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  createdBy: string;

  @ApiProperty({ type: UserSummaryDto })
  createdByUser: UserSummaryDto;

  @ApiProperty({ example: '2026-01-21T10:30:00.000Z', type: 'string', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ example: '2026-01-21T10:30:00.000Z', type: 'string', format: 'date-time' })
  updatedAt: string;

  @ApiPropertyOptional({ description: 'Whether PII was masked in the content', example: false })
  piiMasked?: boolean;
}

export class DeleteDocumentResponseDto {
  @ApiProperty({ example: 'Document deleted successfully' })
  message: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '2026-01-21T11:00:00.000Z', type: 'string', format: 'date-time' })
  deletedAt: string;
}