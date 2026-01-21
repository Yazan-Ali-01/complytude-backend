import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsObject, ValidateNested } from 'class-validator';

export class TenantFeaturesDto {
  @ApiProperty({ example: 5, description: 'Maximum number of documents' })
  @IsNotEmpty()
  document_limit: number;

  @ApiProperty({ example: true, description: 'Access to checklist feature' })
  @IsNotEmpty()
  checklist_access: boolean;

  @ApiProperty({ example: true, description: 'Analyzer feature enabled' })
  @IsNotEmpty()
  analyzer_enabled: boolean;
}

export class CreateTenantDto {
  @ApiProperty({
    example: 'early_access',
    enum: ['early_access', 'basic', 'pro', 'enterprise'],
    description: 'Subscription plan',
  })
  @IsEnum(['early_access', 'basic', 'pro', 'enterprise'])
  @IsNotEmpty()
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise';

  @ApiProperty({
    type: TenantFeaturesDto,
    description: 'Feature configuration',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantFeaturesDto)
  features: TenantFeaturesDto;
}
