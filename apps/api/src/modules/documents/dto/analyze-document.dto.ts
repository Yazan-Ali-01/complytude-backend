import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const MAX_CONTENT_BYTES = 100_000;

export class AnalyzeDocumentDto {
  @ApiProperty({
    description: 'Document title',
    example: 'UAE Employment Contract - Acme Corp',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Plain text content of the document to analyze',
    example: 'This Employment Agreement is entered into...',
    maxLength: MAX_CONTENT_BYTES,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CONTENT_BYTES)
  content: string;

  @ApiPropertyOptional({
    description:
      'Limit analysis to specific rulesets by UUID. When provided, only chunks from these rulesets are searched.',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  rulesetIds?: string[];

  @ApiPropertyOptional({
    description:
      'Limit analysis to specific rulesets by key. Resolved to IDs server-side. Merged with rulesetIds if both provided.',
    example: ['dmcc_company_regulations_2024'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  rulesetKeys?: string[];
}
