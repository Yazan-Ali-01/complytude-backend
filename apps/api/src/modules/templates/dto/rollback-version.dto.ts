import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Request DTO for rolling back to a previous template version
 * Used in POST /templates/:key/versions/:version/rollback endpoint
 * Creates a NEW version based on the specified old version
 */
export class RollbackVersionDto {
  @ApiProperty({
    description:
      'New version number for the rollback (must be higher than current version)',
    example: '2.0.0',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'newVersion must be in format x.y.z (e.g., 2.0.0)',
  })
  newVersion: string;

  @ApiPropertyOptional({
    description: 'Changelog note explaining the rollback',
    example: 'Rolled back to v1.0.0 due to issues with v1.1.0',
  })
  @IsOptional()
  @IsString()
  changelog?: string;
}
