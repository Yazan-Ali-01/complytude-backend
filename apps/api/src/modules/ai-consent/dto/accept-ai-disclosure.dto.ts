import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AcceptAiDisclosureDto {
  @ApiProperty({
    description:
      'The disclosure version the admin was shown; must be the current one (GET /tenants/me/ai-consent → currentVersion)',
    example: '2026-10-01',
    maxLength: 32,
  })
  @IsString()
  @MaxLength(32)
  version: string;
}
