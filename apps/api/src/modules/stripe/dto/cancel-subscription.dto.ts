import { ApiProperty } from '@nestjs/swagger';

export class CancelSubscriptionResponseDto {
  @ApiProperty({
    description:
      'Date when the subscription will be cancelled and access revoked',
    type: String,
    format: 'date-time',
    example: '2026-04-01T00:00:00.000Z',
  })
  cancelsAt: Date;
}
