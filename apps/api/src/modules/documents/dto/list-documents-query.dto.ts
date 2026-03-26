import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto';

export enum DocumentSortBy {
  CREATED_AT = 'createdAt',
  TITLE = 'title',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search documents by title (case-insensitive)',
    example: 'employment',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: DocumentSortBy,
    default: DocumentSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(DocumentSortBy)
  declare sortBy?: DocumentSortBy;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  declare sortOrder?: SortOrder;
}
