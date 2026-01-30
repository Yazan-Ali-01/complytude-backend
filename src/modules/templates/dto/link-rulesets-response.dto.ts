import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for linking rulesets to a template
 * Returns confirmation of successful linking operation
 */
export class LinkRulesetsResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Rulesets linked successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Number of rulesets successfully linked',
    example: 2,
  })
  linkedCount: number;

  @ApiProperty({
    description: 'Array of ruleset keys that were linked',
    example: ['dmcc_employment_rules_v1', 'ifza_employment_rules_v1'],
    type: [String],
  })
  rulesetKeys: string[];
}
