import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Filters for a tenant's audit log (newest first). */
export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Rows per page',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Only this action',
    example: 'DOCUMENT_DELETED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({
    description: 'Only this resource type',
    example: 'documents',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Only rows by this user (UUID)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({
    description: 'From this time (ISO 8601), inclusive',
    example: '2026-09-01T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Up to this time (ISO 8601), inclusive',
    example: '2026-09-30T23:59:59Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

/** The platform view can also narrow to one tenant. */
export class AdminListAuditLogsQueryDto extends ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Only rows of this tenant (UUID)' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
