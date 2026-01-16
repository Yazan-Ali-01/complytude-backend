import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentResponseDto } from './document-response.dto';

export class ListDocumentsDto {
  @ApiPropertyOptional({
    example:
      'eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFoifQ==',
    description: 'Cursor for pagination (base64 encoded)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Number of items per page',
    minimum: 1,
    maximum: 1000,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 50;

  @ApiPropertyOptional({
    example: 'forward',
    description: 'Pagination direction',
    enum: ['forward', 'backward'],
    default: 'forward',
  })
  @IsOptional()
  @IsString()
  @IsIn(['forward', 'backward'])
  direction: 'forward' | 'backward' = 'forward';

  @ApiPropertyOptional({
    example: 'employment_contract',
    description: 'Filter by template key',
  })
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Filter by start date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2024-12-31T23:59:59.999Z',
    description: 'Filter by end date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'Annual Report',
    description: 'Filter by title (partial match)',
  })
  @IsOptional()
  @IsString()
  title?: string;
}

export class ListDocumentsResponseDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  documents: DocumentResponseDto[];

  @ApiProperty({
    example:
      'eyJpZCI6IjQ1NiIsImNyZWF0ZWRfYXQiOiIyMDI0LTAxLTMxVDIzOjU5OjU5Ljk5OVoifQ==',
    description: 'Cursor for next page',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({
    example:
      'eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFoifQ==',
    description: 'Cursor for previous page',
    nullable: true,
  })
  prevCursor: string | null;

  @ApiProperty({ example: true, description: 'Whether there is a next page' })
  hasNext: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether there is a previous page',
  })
  hasPrevious: boolean;
}
