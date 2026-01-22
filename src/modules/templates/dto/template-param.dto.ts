import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Path parameter DTO for template key
 * Validates the :key parameter in routes like /templates/:key
 */
export class TemplateKeyParamDto {
  @ApiProperty({
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}

/**
 * Path parameter DTO for template version
 * Validates both :key and :version parameters in routes like /templates/:key/versions/:version
 */
export class TemplateVersionParamDto {
  @ApiProperty({
    description: 'Template unique key',
    example: 'employment_contract_v1',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Template version (semantic versioning format)',
    example: '1.0.0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  version: string;
}
