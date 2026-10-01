import { ApiProperty, PickType } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';
import { DocumentSummaryDto } from './document-response.dto';
import { ListDocumentsQueryDto } from './list-documents-query.dto';

/** Trash list query: page, limit and title search; always newest deletion first. */
export class ListTrashQueryDto extends PickType(ListDocumentsQueryDto, [
  'page',
  'limit',
  'search',
] as const) {}

/** A document in the trash */
export class TrashedDocumentDto extends DocumentSummaryDto {
  @ApiProperty({
    description: 'When it was deleted',
    example: '2026-10-01T09:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  deletedAt: string;

  @ApiProperty({
    description: 'Who deleted it (user ID)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    nullable: true,
    type: String,
  })
  deletedBy: string | null;

  @ApiProperty({
    description:
      'Until when it can be restored; after this it is erased (text, results and file) and leaves the trash',
    example: '2026-10-31T09:00:00.000Z',
    type: 'string',
    format: 'date-time',
  })
  restorableUntil: string;
}

/** Paginated trash list */
export class DocumentTrashListResponseDto extends PaginatedResponseDto<TrashedDocumentDto> {
  @ApiProperty({
    description: 'Documents in the trash, most recently deleted first',
    type: [TrashedDocumentDto],
  })
  declare data: TrashedDocumentDto[];
}
