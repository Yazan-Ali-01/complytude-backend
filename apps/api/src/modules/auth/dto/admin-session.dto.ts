import { ApiProperty } from '@nestjs/swagger';
import {
  SessionDeviceInfoDto,
  SessionGeoLocationDto,
} from './session-response.dto';

/** Global Redis session statistics for system admin dashboard */
export class AdminSessionStatsResponseDto {
  @ApiProperty({ description: 'Total active identity sessions', example: 42 })
  totalIdentitySessions: number;

  @ApiProperty({ description: 'Total active tenant sessions', example: 120 })
  totalTenantSessions: number;

  @ApiProperty({
    description: 'Tenant session counts keyed by tenant UUID',
    example: { '770e8400-e29b-41d4-a716-446655440002': 15 },
  })
  byTenantId: Record<string, number>;

  @ApiProperty({
    description: 'Identity session counts keyed by device type',
    example: { desktop: 30, mobile: 10, tablet: 2 },
  })
  byDeviceType: Record<string, number>;
}

/** Identity session row — sanitized (no email or business payload) */
export class AdminSanitizedIdentitySessionDto {
  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ type: SessionDeviceInfoDto })
  deviceInfo: SessionDeviceInfoDto;

  @ApiProperty()
  ipAddress: string;

  @ApiProperty({ type: SessionGeoLocationDto, nullable: true })
  geoLocation: SessionGeoLocationDto | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  lastActivityAt: string;

  @ApiProperty({
    description: 'Approximate session age in seconds (now - createdAt)',
    example: 3600,
  })
  durationSeconds: number;
}

/** Tenant session row — sanitized */
export class AdminSanitizedTenantSessionDto {
  @ApiProperty({ format: 'uuid' })
  sessionId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty({ example: 'tenant_admin' })
  role: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  lastActivityAt: string;

  @ApiProperty({
    description: 'Approximate session age in seconds (now - createdAt)',
    example: 900,
  })
  durationSeconds: number;
}

/** Group: identity + linked tenant sessions (admin view) */
export class AdminSessionGroupDto {
  @ApiProperty({ type: AdminSanitizedIdentitySessionDto })
  identitySession: AdminSanitizedIdentitySessionDto;

  @ApiProperty({ type: [AdminSanitizedTenantSessionDto] })
  tenantSessions: AdminSanitizedTenantSessionDto[];
}

export class AdminSessionListResponseDto {
  @ApiProperty({ type: [AdminSessionGroupDto] })
  sessions: AdminSessionGroupDto[];
}
