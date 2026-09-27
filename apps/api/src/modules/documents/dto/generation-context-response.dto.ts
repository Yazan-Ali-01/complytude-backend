import { ApiProperty } from '@nestjs/swagger';

export class GenerationContextResponseDto {
  @ApiProperty({
    description:
      'Map of system variable keys to their resolved values for the current user and tenant context.',
    example: {
      generated_date: '2026-03-29',
      generated_date_formatted: '29 March 2026',
      tenant_name: 'Acme Corp DMCC',
      tenant_trade_license_number: 'DMCC-12345',
      user_full_name: 'Yazan Ali',
      user_email: 'yazan@acme.com',
    },
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  systemVariables: Record<string, string>;
}
