import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query parameters for listing tenant invitations
 */
export class InvitationListQueryDto {
  @ApiProperty({
    description: 'Filter by invitation status',
    enum: ['pending', 'accepted', 'rejected', 'revoked', 'expired'],
    required: false,
    example: 'pending',
  })
  @IsEnum(['pending', 'accepted', 'rejected', 'revoked', 'expired'])
  @IsOptional()
  status?: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';

  @ApiProperty({
    description: 'Filter by email address (partial match)',
    required: false,
    example: 'user@example.com',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Cursor for pagination',
    required: false,
    example: '2026-01-21T10:00:00.000Z',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiProperty({
    description: 'Number of items per page (default: 50)',
    required: false,
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiProperty({
    description: 'Pagination direction',
    enum: ['forward', 'backward'],
    required: false,
    example: 'forward',
  })
  @IsEnum(['forward', 'backward'])
  @IsOptional()
  direction?: 'forward' | 'backward';
}
