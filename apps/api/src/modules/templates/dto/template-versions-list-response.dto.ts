import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { TemplateVersionResponseDto } from './template-response.dto';

/**
 * Paginated response DTO for template versions list
 * Returns list of template versions with pagination metadata
 */
export class TemplateVersionsListResponseDto extends PaginatedResponseDto<TemplateVersionResponseDto> {
  @ApiProperty({
    description: 'Array of template versions',
    type: [TemplateVersionResponseDto],
  })
  declare data: TemplateVersionResponseDto[];
}
