import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClauseDto {
  @ApiProperty({
    example: 'clause_1',
    description: 'Unique clause identifier',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  id: string;

  @ApiProperty({
    example: 'Probation Period',
    description: 'Clause title',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    example:
      'The employee shall be subject to a probation period of {probation_months} months.',
    description: 'Clause content/text',
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
    example: { category: 'employment', tags: ['probation'] },
    description: 'Additional clause metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}
