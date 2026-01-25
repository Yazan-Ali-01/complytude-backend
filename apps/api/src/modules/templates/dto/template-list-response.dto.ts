import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@complytude/shared';
import { TemplateResponseDto } from './template-response.dto';

/**
 * Paginated response DTO for template list
 * Returns list of templates with pagination metadata
 */
export class TemplateListResponseDto extends PaginatedResponseDto<TemplateResponseDto> {
  @ApiProperty({
    description: 'Array of templates',
    type: [TemplateResponseDto],
  })
  declare data: TemplateResponseDto[];
}
