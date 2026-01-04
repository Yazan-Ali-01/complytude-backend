import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateAuthorityDto {
  @ApiProperty({
    example: 'DMCC',
    description: 'Unique authority code (uppercase)',
  })
  @IsString()
  @Transform(({ value }) => value?.toUpperCase())
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({
    example: 'Dubai Multi Commodities Centre',
    description: 'Authority full name',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Dubai free zone authority for commodities trading',
    description: 'Authority description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'United Arab Emirates',
    description: 'Country where authority operates',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country: string = 'United Arab Emirates';

  @ApiPropertyOptional({
    example: true,
    description: 'Whether authority is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  is_active: boolean = true;
}

export class UpdateAuthorityDto {
  @ApiPropertyOptional({
    example: 'Dubai Multi Commodities Centre Authority',
    description: 'Authority full name',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Updated description',
    description: 'Authority description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'UAE',
    description: 'Country where authority operates',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether authority is active',
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
