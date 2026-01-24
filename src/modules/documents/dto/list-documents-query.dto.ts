import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
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
    description: 'Filter documents by template key',
    example: 'dmcc_employment_v1',
  })
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional({
    description:
      'Include soft-deleted documents (admin only - non-admins will be ignored)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  includeDeleted?: boolean;

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
