import { ApiProperty as ApiProperty7 } from '@nestjs/swagger';
import type { PlanKey } from '../../../common/types/entitlement.types';
import { Tenant } from '../entities/tenant.entity';

export class TenantResponseDto {
  constructor(data: Tenant | string) {
    Object.assign(this, data);
  }
  @ApiProperty7({
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty7({
    example: 'navigator',
    enum: ['navigator', 'shield', 'general_counsel', 'infrastructure'],
  })
  plan: PlanKey;

  @ApiProperty7({
    example: true,
  })
  is_active: boolean;

  @ApiProperty7({
    example: '11111111-1111-4111-8111-111111111111',
  })
  parent_tenant_id?: string | null;

  @ApiProperty7({
    example: 'Acme Legal LLC',
    nullable: true,
  })
  name?: string | null;

  @ApiProperty7({
    example: 'acme-legal',
    nullable: true,
  })
  slug?: string | null;

  @ApiProperty7({
    example: 'https://s3.../logo.png',
    nullable: true,
  })
  logo_url?: string | null;

  @ApiProperty7({
    example: 'contact@acme.com',
    nullable: true,
  })
  contact_email?: string | null;

  @ApiProperty7({
    example: 'finance@acme.com',
    nullable: true,
  })
  billing_email?: string | null;

  @ApiProperty7({
    example: '+971501234567',
    nullable: true,
  })
  contact_phone?: string | null;

  @ApiProperty7({
    example: 'Dubai',
    nullable: true,
  })
  emirate?: string | null;

  @ApiProperty7({
    example: 'Dubai',
    nullable: true,
  })
  city?: string | null;

  @ApiProperty7({
    example: '123 Sheikh Zayed Road',
    nullable: true,
  })
  address_line_1?: string | null;

  @ApiProperty7({
    example: 'Floor 12, Tower A',
    nullable: true,
  })
  address_line_2?: string | null;

  @ApiProperty7({
    example: '12345',
    nullable: true,
  })
  postal_code?: string | null;

  @ApiProperty7({
    example: 'DED-123456',
    nullable: true,
  })
  trade_license_number?: string | null;

  @ApiProperty7({
    example: 'Free Zone Establishment',
    nullable: true,
  })
  legal_entity_type?: string | null;

  @ApiProperty7({
    example: '100123456700003',
    nullable: true,
  })
  tax_registration_number?: string | null;

  @ApiProperty7({
    example: 'en',
  })
  locale: string;

  @ApiProperty7({
    example: 'Asia/Dubai',
  })
  timezone: string;

  @ApiProperty7({
    example: 'DMCC',
    nullable: true,
  })
  default_jurisdiction?: string | null;

  @ApiProperty7({
    example: {},
  })
  settings: Record<string, unknown>;

  @ApiProperty7({
    example: '#1A73E8',
    nullable: true,
  })
  brand_color_primary?: string | null;

  @ApiProperty7({
    example: '#FBBC04',
    nullable: true,
  })
  brand_color_secondary?: string | null;

  @ApiProperty7({
    example: null,
    nullable: true,
  })
  deactivated_at?: Date | null;

  @ApiProperty7({
    example: null,
    nullable: true,
  })
  deactivation_reason?: string | null;

  @ApiProperty7({
    example: null,
    nullable: true,
  })
  onboarding_completed_at?: Date | null;

  @ApiProperty7({
    example: {},
  })
  onboarding_metadata: Record<string, unknown>;

  @ApiProperty7({
    example: '2026-01-01T00:00:00.000Z',
  })
  created_at: Date;

  @ApiProperty7({
    example: '2026-02-17T00:00:00.000Z',
  })
  updated_at: Date;
}
