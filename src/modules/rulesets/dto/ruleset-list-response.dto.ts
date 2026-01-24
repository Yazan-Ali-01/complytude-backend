import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { RulesetResponseDto } from './ruleset-response.dto';

/**
 * Paginated ruleset list response DTO
 * Wraps ruleset data with pagination metadata
 */
export class RulesetListResponseDto extends PaginatedResponseDto<RulesetResponseDto> {
  @ApiProperty({
    description: 'Array of rulesets',
    type: [RulesetResponseDto],
  })
  declare data: RulesetResponseDto[];
}
