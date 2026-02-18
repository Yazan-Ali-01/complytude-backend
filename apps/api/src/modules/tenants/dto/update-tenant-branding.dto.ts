import { ApiProperty as ApiProperty4 } from '@nestjs/swagger';
import {
  IsOptional as IsOptional4,
  IsString as IsString4,
  Matches as Matches4,
} from 'class-validator';

export class UpdateTenantBrandingDto {
  @ApiProperty4({
    description: 'Primary hex color',
    example: '#1A73E8',
    required: false,
  })
  @IsString4()
  @Matches4(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brand_color_primary must be a valid hex color (e.g., #1A73E8)',
  })
  @IsOptional4()
  brand_color_primary?: string;

  @ApiProperty4({
    description: 'Secondary hex color',
    example: '#FBBC04',
    required: false,
  })
  @IsString4()
  @Matches4(/^#[0-9A-Fa-f]{6}$/, {
    message: 'brand_color_secondary must be a valid hex color (e.g., #FBBC04)',
  })
  @IsOptional4()
  brand_color_secondary?: string;
}
