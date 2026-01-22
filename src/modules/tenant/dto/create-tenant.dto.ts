import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({ example: 'user@example.com', description: 'Tenant email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'admin',
    enum: ['admin', 'user', 'viewer'],
    description: 'User role',
  })
  @IsEnum(['admin', 'user', 'viewer'])
  @IsNotEmpty()
  role: 'admin' | 'user' | 'viewer';

  @ApiProperty({
    example: 'navigator',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
    description: 'Subscription plan',
  })
  @IsEnum(['navigator', 'shield', 'general_counsel', 'infrastructure'])
  @IsNotEmpty()
  plan: 'navigator' | 'shield' | 'general_counsel' | 'infrastructure';

  @ApiProperty({
    type: TenantFeaturesDto,
    description: 'Feature configuration',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantFeaturesDto)
  features: TenantFeaturesDto;
}
