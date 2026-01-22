import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { RulesetVersionResponseDto } from './ruleset-version-response.dto';

/**
 * Paginated ruleset versions list response DTO
 * Returns paginated array of versions for a specific ruleset
 */
export class RulesetVersionsListResponseDto extends PaginatedResponseDto<RulesetVersionResponseDto> {
  @ApiProperty({
    description: 'Array of ruleset versions',
    type: [RulesetVersionResponseDto],
  })
  declare data: RulesetVersionResponseDto[];
}
