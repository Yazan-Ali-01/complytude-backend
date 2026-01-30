import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
} from 'class-validator';
import { DocumentFormat } from './preview-document.dto';

export class GenerateDocumentDto {
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
    description: 'Document formats to generate (one or both)',
    enum: DocumentFormat,
    isArray: true,
    example: [DocumentFormat.DOCX, DocumentFormat.PDF],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(DocumentFormat, { each: true })
  formats: DocumentFormat[];
}
