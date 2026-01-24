import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { CategoryResponseDto } from './category-response.dto';

/**
 * Paginated list of categories response DTO
 */
export class CategoryListResponseDto extends PaginatedResponseDto<CategoryResponseDto> {
  @ApiProperty({
    description: 'Array of categories',
    type: [CategoryResponseDto],
  })
  declare data: CategoryResponseDto[];
}
