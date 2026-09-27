import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class PreviewDocumentDto {
  @ApiProperty({
    description: 'Template key (e.g. "dmcc-employment-contract")',
    example: 'dmcc-employment-contract',
  })
  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @ApiPropertyOptional({
    description:
      'Semver template version. Defaults to current_version if omitted.',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'templateVersion must follow semver format (e.g. 1.0.0)',
  })
  templateVersion?: string;

  @ApiProperty({
    description: 'Variable values to fill the template placeholders',
    example: {
      employee_name: 'John Doe',
      salary: 15000,
      start_date: '2026-04-01',
    },
  })
  @IsObject()
  @IsNotEmpty()
  variables: Record<string, unknown>;
}

export class PreviewDocumentResponseDto {
  @ApiProperty({
    description: 'Generation job ID to poll for status',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  generationJobId: string;
}
