import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';

export enum DocumentFormat {
  DOCX = 'docx',
  PDF = 'pdf',
}

export class PreviewDocumentDto {
  @ApiProperty({
    description: 'Template key to use for document generation',
    example: 'dmcc_employment_v1',
  })
  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @ApiProperty({
    description: 'Variables to replace placeholders in the template',
    example: {
      employee_name: 'John Doe',
      salary: '5000',
      start_date: '2026-01-01',
      position: 'Software Engineer',
    },
  })
  @IsObject()
  variables: Record<string, unknown>;

  @ApiProperty({
    description: 'Document format for preview',
    enum: DocumentFormat,
    example: DocumentFormat.DOCX,
  })
  @IsEnum(DocumentFormat)
  format: DocumentFormat;
}
