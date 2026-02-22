import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateTenantBrandingDto {
  @ApiProperty({
    description: 'Primary hex color',
    example: '#1A73E8',
    required: false,
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brand_color_primary must be a valid hex color (e.g., #1A73E8)',
  })
  @IsOptional()
  brand_color_primary?: string;

  @ApiProperty({
    description: 'Secondary hex color',
    example: '#FBBC04',
    required: false,
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brand_color_secondary must be a valid hex color (e.g., #FBBC04)',
  })
  @IsOptional()
  brand_color_secondary?: string;
}
