import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsTimeZone,
} from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiProperty({
    description: 'Preferred language',
    example: 'en',
    enum: ['en', 'ar'],
    required: false,
  })
  @IsIn(['en', 'ar'])
  @IsOptional()
  locale?: string;

  @ApiProperty({
    description: 'IANA timezone',
    example: 'Asia/Dubai',
    required: false,
  })
  @IsString()
  @IsTimeZone()
  @IsOptional()
  timezone?: string;

  @ApiProperty({
    description: 'Default authority for document generation',
    example: 'DMCC',
    required: false,
  })
  @IsString()
  @IsOptional()
  default_jurisdiction?: string;

  @ApiProperty({
    description: 'Additional settings (merged with existing)',
    example: { notifications_enabled: true },
    required: false,
  })
  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}
