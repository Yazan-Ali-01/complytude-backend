import { ApiProperty } from '@nestjs/swagger';

export class ConfirmUploadResponseDto {
  @ApiProperty({
    description: 'UUID of the document',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  documentId: string;

  @ApiProperty({
    description: 'Current extraction status of the document',
    example: 'processing',
    enum: ['processing'],
  })
  status: 'processing';

  @ApiProperty({
    description: 'Human-readable confirmation message',
    example: 'Upload confirmed. Text extraction has been queued.',
  })
  message: string;
}
