import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateTenantSlugDto {
  @ApiProperty({
    description:
      'URL-safe identifier. Lowercase alphanumeric + hyphens, 3-50 chars.',
    example: 'acme-legal',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Transform(({ value }) => value?.toLowerCase())
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, {
    message:
      'Slug must be 3-50 chars, lowercase alphanumeric and hyphens only, cannot start or end with a hyphen',
  })
  slug: string;
}
