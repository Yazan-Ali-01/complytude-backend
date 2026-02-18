import { ApiProperty as ApiProperty3 } from '@nestjs/swagger';
import {
  IsIn as IsIn3,
  IsObject,
  IsOptional as IsOptional3,
  IsString as IsString3,
} from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiProperty3({
    description: 'Preferred language',
    example: 'en',
    enum: ['en', 'ar'],
    required: false,
  })
  @IsIn3(['en', 'ar'])
  @IsOptional3()
  locale?: string;

  @ApiProperty3({
    description: 'IANA timezone',
    example: 'Asia/Dubai',
    required: false,
  })
  @IsString3()
  @IsOptional3()
  timezone?: string;

  @ApiProperty3({
    description: 'Default authority for document generation',
    example: 'DMCC',
    required: false,
  })
  @IsString3()
  @IsOptional3()
  default_jurisdiction?: string;

  @ApiProperty3({
    description: 'Additional settings (merged with existing)',
    example: { notifications_enabled: true },
    required: false,
  })
  @IsObject()
  @IsOptional3()
  settings?: Record<string, unknown>;
}
