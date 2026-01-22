import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GrantOverrideDto {
  @ApiProperty({ example: 'tenant_abc123' })
  @IsString()
  @IsNotEmpty()
  tenant_id: string;

  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  @IsNotEmpty()
  feature_key: string;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  override_value: boolean | number | string | string[];

  @ApiProperty({ example: 'Customer trial for premium features' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}

export class BulkOverrideItemDto {
  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  @IsNotEmpty()
  feature_key: string;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  override_value: boolean | number | string | string[];

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}

export class BulkGrantOverrideDto {
  @ApiProperty({ example: 'tenant_abc123' })
  @IsString()
  @IsNotEmpty()
  tenant_id: string;

  @ApiProperty({ type: [BulkOverrideItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkOverrideItemDto)
  overrides: BulkOverrideItemDto[];

  @ApiProperty({ example: 'Enterprise trial package' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RevokeOverrideDto {
  @ApiProperty({ example: 'tenant_abc123' })
  @IsString()
  @IsNotEmpty()
  tenant_id: string;

  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  @IsNotEmpty()
  feature_key: string;

  @ApiProperty({ example: 'Trial period ended' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class FeatureOverrideResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenant_id: string;
  @ApiProperty() feature_key: string;
  @ApiProperty() override_value: any;
  @ApiProperty() reason: string;
  @ApiProperty() granted_by: string;
  @ApiProperty() granted_at: Date;
  @ApiPropertyOptional() expires_at?: Date;
  @ApiPropertyOptional() revoked_at?: Date;
  @ApiPropertyOptional() revoked_by?: string;
  @ApiPropertyOptional() revoke_reason?: string;
}

export class UsageCheckResponseDto {
  @ApiProperty({ example: true }) allowed: boolean;
  @ApiProperty({ example: 45 }) current_usage: number;
  @ApiProperty({ example: 100 }) usage_limit: number;
  @ApiProperty({ example: 55 }) remaining: number;
}

export class AddCreditsDto {
  @ApiProperty({ example: 'tenant_abc123' })
  @IsString()
  @IsNotEmpty()
  tenant_id: string;

  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  @IsNotEmpty()
  feature_key: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @IsNotEmpty()
  credits: number;

  @ApiPropertyOptional({ example: 'Manual credit grant by admin' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PurchaseCreditsDto {
  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  @IsNotEmpty()
  feature_key: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @IsNotEmpty()
  credits: number;
}

export class CreditBalanceResponseDto {
  @ApiProperty() tenant_id: string;
  @ApiProperty() feature_key: string;
  @ApiProperty() credits_remaining: number;
  @ApiProperty() price_per_credit_aed: number;
}

export class UsageWithCreditsResponseDto {
  @ApiProperty({ example: true }) allowed: boolean;
  @ApiProperty({ example: 'quota', enum: ['quota', 'credits', 'none'] })
  source: string;
  @ApiProperty({ example: 100 }) current_usage: number;
  @ApiProperty({ example: 100 }) usage_limit: number;
  @ApiProperty({ example: 0 }) remaining_quota: number;
  @ApiProperty({ example: 5 }) credits_available: number;
  @ApiPropertyOptional({ example: true }) can_purchase_credits?: boolean;
  @ApiPropertyOptional({ example: 125 }) price_per_credit_aed?: number;
}

export class CreditPurchaseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenant_id: string;
  @ApiProperty() feature_key: string;
  @ApiProperty() credits_purchased: number;
  @ApiProperty() price_aed: number;
  @ApiPropertyOptional() stripe_payment_intent_id?: string;
  @ApiPropertyOptional() stripe_invoice_id?: string;
  @ApiProperty() payment_status:
    | 'pending'
    | 'completed'
    | 'failed'
    | 'refunded';
  @ApiPropertyOptional() purchased_by?: string;
  @ApiProperty() purchased_at: Date;
  @ApiPropertyOptional() metadata?: Record<string, any>;
}
