import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const UAE_EMIRATES = [
  'Dubai',
  'Abu Dhabi',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
] as const;

export class UpdateTenantProfileDto {
  @ApiProperty({
    description: 'Organization display name',
    example: 'Acme Legal LLC',
    required: false,
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Primary contact email',
    example: 'contact@acme.com',
    required: false,
  })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  @IsOptional()
  contact_email?: string;

  @ApiProperty({
    description: 'Billing email',
    example: 'finance@acme.com',
    required: false,
  })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  @IsOptional()
  billing_email?: string;

  @ApiProperty({
    description: 'Contact phone',
    example: '+971501234567',
    required: false,
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  contact_phone?: string;

  @ApiProperty({
    description: 'UAE Emirate',
    example: 'Dubai',
    enum: UAE_EMIRATES,
    required: false,
  })
  @IsIn(UAE_EMIRATES)
  @IsOptional()
  emirate?: string;

  @ApiProperty({ description: 'City', example: 'Dubai', required: false })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiProperty({
    description: 'Street address',
    example: '123 Sheikh Zayed Road',
    required: false,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address_line_1?: string;

  @ApiProperty({
    description: 'Additional address',
    example: 'Floor 12, Tower A',
    required: false,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  address_line_2?: string;

  @ApiProperty({
    description: 'P.O. Box / postal code',
    example: '12345',
    required: false,
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  postal_code?: string;

  @ApiProperty({
    description: 'UAE Trade License Number',
    example: 'DED-123456',
    required: false,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  trade_license_number?: string;

  @ApiProperty({
    description: 'Legal entity type',
    example: 'Free Zone Establishment',
    required: false,
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  legal_entity_type?: string;

  @ApiProperty({
    description: 'VAT/TRN number',
    example: '100123456700003',
    required: false,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  tax_registration_number?: string;
}
