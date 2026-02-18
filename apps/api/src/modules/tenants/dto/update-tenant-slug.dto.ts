import { ApiProperty as ApiProperty2 } from '@nestjs/swagger';
import { Transform as Transform2 } from 'class-transformer';
import {
  IsString as IsString2,
  Matches,
  MaxLength as MaxLength2,
  MinLength,
} from 'class-validator';

export class UpdateTenantSlugDto {
  @ApiProperty2({
    description:
      'URL-safe identifier. Lowercase alphanumeric + hyphens, 3-50 chars.',
    example: 'acme-legal',
    minLength: 3,
    maxLength: 50,
  })
  @IsString2()
  @MinLength(3)
  @MaxLength2(50)
  @Transform2(({ value }) => value?.toLowerCase())
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, {
    message:
      'Slug must be 3-50 chars, lowercase alphanumeric and hyphens only, cannot start or end with a hyphen',
  })
  slug: string;
}
