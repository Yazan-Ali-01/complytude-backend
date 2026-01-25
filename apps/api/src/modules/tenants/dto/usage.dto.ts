import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class UsageQueryDto {
  @ApiPropertyOptional({ example: 'documents_per_month' })
  @IsString()
  @IsOptional()
  featureKey?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Start date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-01-31',
    description: 'End date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}

export class UsageCheckResponseDto {
  @ApiProperty({ example: true }) allowed: boolean;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 8 }) current: number;
  @ApiProperty({ example: 12 }) remaining: number;
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;
  @ApiProperty({ example: '8/20 documents used this month' }) message: string;
}

export class UsageSummaryResponseDto {
  @ApiProperty() tenantId: string;
  @ApiProperty() periodStart: Date;
  @ApiProperty() periodEnd: Date;

  @ApiProperty({
    example: {
      documents_per_month: {
        allowed: true,
        limit: 20,
        current: 8,
        remaining: 12,
      },
      contract_reviews_per_month: {
        allowed: true,
        limit: 5,
        current: 2,
        remaining: 3,
      },
    },
  })
  features: Record<string, UsageCheckResponseDto>;
}

export class UsageEventResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() featureKey: string;
  @ApiProperty() userId: string | null;
  @ApiProperty({ enum: ['increment', 'decrement', 'reset'] }) eventType: string;
  @ApiProperty({ example: 1 }) delta: number;
  @ApiProperty() metadata: Record<string, unknown> | null;
  @ApiProperty() createdAt: Date;
}

export class UsageHistoryResponseDto {
  @ApiProperty({ type: [UsageEventResponseDto] })
  events: UsageEventResponseDto[];

  @ApiProperty()
  total: number;
}

export class ResetUsageDto {
  @ApiPropertyOptional({ description: 'Reason for reset (audit trail)' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class IncrementUsageDto {
  @ApiProperty({ example: 'documents_per_month' })
  @IsString()
  featureKey: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  delta?: number = 1;

  @ApiPropertyOptional({
    description: 'Additional context for the usage event',
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
