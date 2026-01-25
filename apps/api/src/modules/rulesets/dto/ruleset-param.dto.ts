import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Path parameter DTO for ruleset key
 * Validates the :key parameter in routes like /rulesets/:key
 */
export class RulesetKeyParamDto {
  @ApiProperty({
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @IsString()
  @IsNotEmpty()
  key: string;
}

/**
 * Path parameter DTO for ruleset version
 * Validates both :key and :version parameters in routes like /rulesets/:key/versions/:version
 */
export class RulesetVersionParamDto {
  @ApiProperty({
    description: 'Ruleset unique key',
    example: 'dmcc_employment_rules_v1',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Ruleset version (semantic versioning format)',
    example: '1.0.0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'version must be in format x.y.z (e.g., 1.0.0)',
  })
  version: string;
}
