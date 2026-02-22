import { ApiProperty } from '@nestjs/swagger';

/**
 * Simple message response for operations that don't return data
 * Used for operations like delete, logout, password reset, etc.
 */
export class MessageResponseDto {
  constructor(message: string) {
    this.message = message;
  }
  @ApiProperty({
    description: 'Success message describing the operation result',
    example: 'Operation completed successfully',
  })
  message: string;
}

/**
 * Response with message and additional metadata
 */
export class MessageWithMetadataResponseDto extends MessageResponseDto {
  @ApiProperty({
    description: 'Additional metadata about the operation',
    example: { affectedRecords: 1 },
    required: false,
  })
  metadata?: Record<string, any>;
}
