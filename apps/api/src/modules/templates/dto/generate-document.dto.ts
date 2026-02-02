import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateDocumentDto {
  @ApiProperty({
    example: {
      employee_name: 'John Doe',
      salary: '5000',
      start_date: '2025-01-01',
      position: 'Software Engineer',
    },
    description: 'Variables to replace placeholders in the template',
  })
  @IsObject()
  variables: Record<string, unknown>;
}

export class GenerateDocumentResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique identifier for the generated document',
  })
  documentId: string;

  @ApiProperty({
    example: 'https://s3.example.com/signed-url?expires=...',
    description: 'Signed URL to download the generated document',
  })
  downloadUrl: string;

  @ApiProperty({
    example: 'dmcc_employment_v1',
    description: 'Template key used for generation',
  })
  templateKey: string;

  @ApiProperty({
    example: '1.0.0',
    description: 'Template version used for generation',
  })
  templateVersion: string;

  @ApiProperty({
    example: '2025-01-15T10:30:00Z',
    description: 'Timestamp when the document was generated',
  })
  generatedAt: Date;
}
