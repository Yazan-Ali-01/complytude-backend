import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOverrideDto {
  @ApiProperty({
    example: 'documents_per_month',
    description: 'Feature key from features registry',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  featureKey: string;

  @ApiProperty({
    example: 50,
    description: 'Override value (type depends on feature)',
  })
  @IsNotEmpty()
  value: unknown;

  @ApiPropertyOptional({
    example: '30-day enterprise trial',
    description: 'Business justification',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example: '2026-02-25T00:00:00Z',
    description: 'Expiration date (null = permanent)',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class BulkCreateOverrideDto {
  @ApiProperty({
    type: [CreateOverrideDto],
    description: 'Array of overrides to create',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOverrideDto)
  overrides: CreateOverrideDto[];

  @ApiPropertyOptional({
    example: 'Partnership deal',
    description: 'Shared reason for all overrides',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

export class OverrideResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tenantId: string;
  @ApiProperty() featureKey: string;
  @ApiProperty() value: unknown;
  @ApiProperty({
    description: 'User who granted this override',
    nullable: true,
  })
  grantedBy: string | null;
  @ApiProperty() grantedAt: Date;
  @ApiProperty({ description: 'Business reason for override', nullable: true })
  reason: string | null;
  @ApiProperty({ description: 'Override expiration date', nullable: true })
  expiresAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OverrideListResponseDto {
  @ApiProperty({ type: [OverrideResponseDto] })
  overrides: OverrideResponseDto[];

  @ApiProperty({ example: 5 })
  total: number;
}

export class RevokeOverrideResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  featureKey: string;

  @ApiProperty({
    example: "Override for 'documents_per_month' has been revoked",
  })
  message: string;
}

export class ValidateOverrideDto {
  @ApiProperty({
    example: 'documents_per_month',
    description: 'Feature key to validate',
  })
  @IsString()
  @IsNotEmpty()
  featureKey: string;

  @ApiProperty({ example: 50, description: 'Value to validate' })
  @IsNotEmpty()
  value: unknown;
}

export class ValidateOverrideResponseDto {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({
    example: 'Value is within valid range',
    description: 'Validation message',
    nullable: true,
  })
  message: string | null;

  @ApiPropertyOptional({
    example: ['essential', 'full'],
    description: 'Valid enum values if feature is enum type',
  })
  validValues?: string[];
}
