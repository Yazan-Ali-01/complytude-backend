import { ApiProperty } from '@nestjs/swagger';

export class PaginationResponseDto<T> {
  @ApiProperty({
    type: [Object], // Swagger can't infer T at runtime; override in child classes
    description: 'Array of paginated items',
  })
  data: T[];

  @ApiProperty({
    example: 'eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI0LTAxLTAxIn0=',
    nullable: true,
    description: 'Cursor to fetch the next page',
  })
  nextCursor: string | null;

  @ApiProperty({
    example: 'eyJpZCI6IjQ1NiIsImNyZWF0ZWRfYXQiOiIyMDI0LTAxLTAxIn0=',
    nullable: true,
    description: 'Cursor to fetch the previous page',
  })
  prevCursor: string | null;

  @ApiProperty({
    example: true,
    description: 'Indicates if there are more items after this page',
  })
  hasNext: boolean;

  @ApiProperty({
    example: false,
    description: 'Indicates if there are more items before this page',
  })
  hasPrevious: boolean;

  constructor(
    data: T[],
    nextCursor: string | null,
    prevCursor: string | null,
    hasNext: boolean,
    hasPrevious: boolean,
  ) {
    this.data = data;
    this.nextCursor = nextCursor;
    this.prevCursor = prevCursor;
    this.hasNext = hasNext;
    this.hasPrevious = hasPrevious;
  }
}
