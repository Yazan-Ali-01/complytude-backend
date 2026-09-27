import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for renaming an identity session (PATCH /auth/sessions/:sessionId).
 * Only identity sessions have sessionName; tenant sessions cannot be renamed.
 */
export class RenameSessionDto {
  @ApiProperty({
    description: 'Custom session label (e.g. "Work laptop", "Phone")',
    example: 'Work laptop',
    maxLength: 100,
    nullable: true,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionName?: string | null;
}
