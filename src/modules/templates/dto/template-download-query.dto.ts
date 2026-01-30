import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query DTO for downloading template files
 */
export class TemplateDownloadQueryDto {
  @ApiPropertyOptional({
    description:
      'Version number (semantic versioning format: x.y.z). Defaults to current version if not specified.',
    example: '1.0.0',
    pattern: '^\\d+\\.\\d+\\.\\d+$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'Version must follow semantic versioning format (x.y.z)',
  })
  version?: string;
}
