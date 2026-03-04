import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { RulesetSummaryResponseDto } from './ruleset-response.dto';

/**
 * Paginated ruleset list response DTO.
 * Uses RulesetSummaryResponseDto (without version data) for performance.
 */
export class RulesetListResponseDto extends PaginatedResponseDto<RulesetSummaryResponseDto> {
  @ApiProperty({
    description: 'Array of rulesets',
    type: [RulesetSummaryResponseDto],
  })
  declare data: RulesetSummaryResponseDto[];
}
