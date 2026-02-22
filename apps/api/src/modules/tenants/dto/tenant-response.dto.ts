import { ApiProperty } from '@nestjs/swagger';
import type { PlanKey } from '../../../common/types/entitlement.types';
import { Tenant } from '../entities/tenant.entity';

export class TenantResponseDto {
  constructor(data: Tenant | string) {
    Object.assign(this, data);
  }
  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    example: 'navigator',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
  })
  plan: PlanKey;

  @ApiProperty({
    example: true,
  })
  is_active: boolean;

  @ApiProperty({
    example: '11111111-1111-4111-8111-111111111111',
  })
  parent_tenant_id?: string | null;

  @ApiProperty({
    example: 'Acme Legal LLC',
    nullable: true,
  })
  name?: string | null;

  @ApiProperty({
    example: 'acme-legal',
    nullable: true,
  })
  slug?: string | null;

  @ApiProperty({
    example: 'https://s3.../logo.png',
    nullable: true,
  })
  logo_url?: string | null;

  @ApiProperty({
    example: 'contact@acme.com',
    nullable: true,
  })
  contact_email?: string | null;

  @ApiProperty({
    example: 'finance@acme.com',
    nullable: true,
  })
  billing_email?: string | null;

  @ApiProperty({
    example: '+971501234567',
    nullable: true,
  })
  contact_phone?: string | null;

  @ApiProperty({
    example: 'Dubai',
    nullable: true,
  })
  emirate?: string | null;

  @ApiProperty({
    example: 'Dubai',
    nullable: true,
  })
  city?: string | null;

  @ApiProperty({
    example: '123 Sheikh Zayed Road',
    nullable: true,
  })
  address_line_1?: string | null;

  @ApiProperty({
    example: 'Floor 12, Tower A',
    nullable: true,
  })
  address_line_2?: string | null;

  @ApiProperty({
    example: '12345',
    nullable: true,
  })
  postal_code?: string | null;

  @ApiProperty({
    example: 'DED-123456',
    nullable: true,
  })
  trade_license_number?: string | null;

  @ApiProperty({
    example: 'Free Zone Establishment',
    nullable: true,
  })
  legal_entity_type?: string | null;

  @ApiProperty({
    example: '100123456700003',
    nullable: true,
  })
  tax_registration_number?: string | null;

  @ApiProperty({
    example: 'en',
  })
  locale: string;

  @ApiProperty({
    example: 'Asia/Dubai',
  })
  timezone: string;

  @ApiProperty({
    example: 'DMCC',
    nullable: true,
  })
  default_jurisdiction?: string | null;

  @ApiProperty({
    example: {},
  })
  settings: Record<string, unknown>;

  @ApiProperty({
    example: '#1A73E8',
    nullable: true,
  })
  brand_color_primary?: string | null;

  @ApiProperty({
    example: '#FBBC04',
    nullable: true,
  })
  brand_color_secondary?: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
  })
  deactivated_at?: Date | null;

  @ApiProperty({
    example: null,
    nullable: true,
  })
  deactivation_reason?: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
  })
  onboarding_completed_at?: Date | null;

  @ApiProperty({
    example: {},
  })
  onboarding_metadata: Record<string, unknown>;

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
  })
  created_at: Date;

  @ApiProperty({
    example: '2026-02-17T00:00:00.000Z',
  })
  updated_at: Date;
}
