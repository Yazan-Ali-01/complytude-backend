import { ApiProperty } from '@nestjs/swagger';
import { TenantResponseDto } from '../../modules/tenants/dto/tenant-response.dto';
import { Tenant } from '../../modules/tenants/entities/tenant.entity';
import { CursorPaginationResult } from '../../repositories/base/cursor-pagination.helper';
import { PaginationResponseDto } from './pagination-response.dto';

export class TenantCursorPaginatedResponseDto extends PaginationResponseDto<TenantResponseDto> {
  // ✅ Override the @ApiProperty to tell Swagger the exact type
  @ApiProperty({
    type: [TenantResponseDto], // ✅ Swagger now knows it's TenantResponseDto[]
    description: 'Array of tenant objects',
  })
  declare data: TenantResponseDto[]; // ✅ TypeScript knows it's TenantResponseDto[]

  constructor(
    data: TenantResponseDto[],
    nextCursor: string | null,
    prevCursor: string | null,
    hasNext: boolean,
    hasPrevious: boolean,
  ) {
    super(data, nextCursor, prevCursor, hasNext, hasPrevious);
  }

  /**
   * Factory method to convert internal CursorPaginationResult<Tenant>
   * into the paginated DTO with proper mapping
   */
  static fromResult(
    result: CursorPaginationResult<Tenant>,
    mapFn?: (entity: Tenant) => TenantResponseDto,
  ): TenantCursorPaginatedResponseDto {
    const mappedData = mapFn
      ? result.data.map(mapFn)
      : result.data.map((t: Tenant) => new TenantResponseDto(t));

    return new TenantCursorPaginatedResponseDto(
      mappedData,
      result.nextCursor,
      result.prevCursor,
      result.hasNext,
      result.hasPrevious,
    );
  }
}
