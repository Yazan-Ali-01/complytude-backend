import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** The legal review of a ruleset version (D-9), as a platform admin records it. */
export class ReviewRulesetVersionDto {
  @ApiProperty({
    description: 'Who reviewed the text: the law firm and the reviewing lawyer',
    example: 'Al Tamimi & Company — Jane Doe',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reviewedBy: string;

  @ApiProperty({
    description: 'Date of the review (YYYY-MM-DD)',
    example: '2026-11-15',
  })
  @IsISO8601({ strict: true })
  @MaxLength(10)
  reviewedAt: string;

  @ApiProperty({
    description: 'Scope or conditions of the review, the opinion reference, …',
    required: false,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class IngestRulesetQueryDto {
  @ApiProperty({
    description: 'The version to ingest; the active version when omitted',
    required: false,
    example: '1.1.0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;
}
