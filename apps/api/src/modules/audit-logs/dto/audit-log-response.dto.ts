import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from 'src/common/dto';

export class AuditLogResponseDto {
  @ApiProperty({ example: '8f1b3d2e-4c5a-4b6d-9e7f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({
    nullable: true,
    description: 'NULL for platform-level events',
  })
  tenantId: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'The user who acted, or the account concerned for anonymous events',
  })
  actorId: string | null;

  @ApiProperty({ enum: ['user', 'system', 'api_key', 'anonymous'] })
  actorType: string;

  @ApiProperty({ nullable: true, example: 'tenant_admin' })
  userRole: string | null;

  @ApiProperty({ example: 'DOCUMENT_DELETED' })
  action: string;

  @ApiProperty({ example: 'documents' })
  resourceType: string;

  @ApiProperty({ nullable: true })
  resourceId: string | null;

  @ApiProperty({
    description:
      'Request method and URL, outcome (success or failure) and status, and event-specific fields',
    example: {
      method: 'DELETE',
      url: '/api/v1/documents/…',
      outcome: 'success',
    },
  })
  details: Record<string, unknown>;

  @ApiProperty({ nullable: true, example: '203.0.113.7' })
  ipAddress: string | null;

  @ApiProperty({ nullable: true })
  userAgent: string | null;

  @ApiProperty({ nullable: true, description: 'Request trace id' })
  traceId: string | null;

  @ApiProperty({ example: '2026-09-30T10:00:00.000Z' })
  createdAt: string;
}

export class AuditLogListResponseDto extends PaginatedResponseDto<AuditLogResponseDto> {
  @ApiProperty({ type: [AuditLogResponseDto] })
  declare data: AuditLogResponseDto[];
}
