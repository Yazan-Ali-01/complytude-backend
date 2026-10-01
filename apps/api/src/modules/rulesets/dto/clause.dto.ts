import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CLAUSE_SEVERITIES,
  type ClauseSeverity,
} from '../entities/ruleset.entity';

/**
 * One rule: an article or sub-article of a published instrument, in its own words. Analyses
 * judge against `content` and cite `article`/`section`; `guidance` is a paraphrase the model may
 * read, never what a finding cites.
 */
export class ClauseItemDto {
  @ApiProperty({
    example: 'flr_art_8',
    description: 'Unique clause identifier',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  id: string;

  @ApiProperty({
    example: 'Employment contract',
    description: 'Clause title',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example: 'The text of the article, exactly as published.',
    description:
      'The rule in the words of its published source, verbatim (one article or sub-article)',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({
    example: 1,
    description: 'Display order',
  })
  @IsNumber()
  @IsNotEmpty()
  order: number;

  @ApiProperty({
    example: true,
    description: 'Whether this clause is required',
  })
  @IsBoolean()
  @IsNotEmpty()
  is_required: boolean;

  @ApiPropertyOptional({
    example: 'Art. 8',
    description: 'Article or sub-article number, as cited',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  article?: string;

  @ApiPropertyOptional({
    example: 'Chapter Two',
    description: 'Section, chapter or part of the source',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  section?: string;

  @ApiPropertyOptional({
    example: 'high',
    enum: CLAUSE_SEVERITIES,
    description:
      'Baseline risk of a breach (critical and high → high); the model may raise it, never lower it',
  })
  @IsOptional()
  @IsIn(CLAUSE_SEVERITIES)
  severity?: ClauseSeverity;

  @ApiPropertyOptional({
    example:
      'Federal Decree-Law No. 33 of 2021 on the Regulation of Labour Relations',
    description: 'The instrument the text comes from',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  source_title?: string;

  @ApiPropertyOptional({
    example: 'https://uaelegislation.gov.ae/en',
    description: 'Where the official published text is',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  source_url?: string;

  @ApiPropertyOptional({
    example: '2022-02-02',
    description: 'When this text took effect (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effective_date?: string;

  @ApiPropertyOptional({
    example: 'What the article requires, in plain words.',
    description:
      'A plain-language explanation the model reads alongside the text; never cited',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  guidance?: string;

  @ApiPropertyOptional({
    example: { tags: ['contract'] },
    description: 'Any other clause metadata',
    default: {},
  })
  @IsOptional()
  metadata: Record<string, unknown> = {};
}
