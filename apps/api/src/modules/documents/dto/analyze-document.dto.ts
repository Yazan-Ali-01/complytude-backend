import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AnalysisScopeDto } from './analysis-scope.dto';

const MAX_CONTENT_BYTES = 100_000;

export class AnalyzeDocumentDto extends AnalysisScopeDto {
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
}
