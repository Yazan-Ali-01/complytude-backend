import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { GetTemplateResponseDto } from './template-response.dto';

/**
 * Paginated response DTO for template list
 * Returns list of templates with pagination metadata
 */
export class ListTemplatesResponseDto extends PaginatedResponseDto<GetTemplateResponseDto> {
  @ApiProperty({
    description: 'Array of templates',
    type: [GetTemplateResponseDto],
  })
  declare data: GetTemplateResponseDto[];
}
