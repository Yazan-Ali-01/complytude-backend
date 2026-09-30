import { ApiProperty } from '@nestjs/swagger';

export class AiConsentStatusDto {
  @ApiProperty({
    description:
      'Version of the AI processing disclosure the organization must accept',
    example: '2026-10-01',
  })
  currentVersion: string;

  @ApiProperty({
    description:
      'Whether the current version is accepted. Contract analysis and uploads are refused (403, reason ai_consent_required) until it is',
    example: true,
  })
  accepted: boolean;

  @ApiProperty({
    description: 'The latest version accepted, if any',
    example: '2026-10-01',
    nullable: true,
    type: String,
  })
  acceptedVersion: string | null;

  @ApiProperty({
    description: 'When the latest version was accepted',
    example: '2026-10-01T09:30:00.000Z',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  acceptedAt: string | null;

  @ApiProperty({
    description:
      'User ID of the tenant admin who accepted it (null once that user is deleted)',
    example: '11111111-1111-4111-8111-111111111111',
    nullable: true,
    type: String,
  })
  acceptedBy: string | null;
}
