import { ApiProperty } from '@nestjs/swagger';

/** Device metadata in session response */
export class SessionDeviceInfoDto {
  @ApiProperty({
    description: 'Device type',
    example: 'desktop',
    enum: ['mobile', 'desktop', 'tablet'],
  })
  deviceType: string;

  @ApiProperty({ description: 'Browser name', example: 'Chrome' })
  browserName: string;

  @ApiProperty({ description: 'Browser version', example: '120.0' })
  browserVersion: string;

  @ApiProperty({ description: 'Operating system', example: 'Windows 10' })
  operatingSystem: string;
}

/** Geo location in session response */
export class SessionGeoLocationDto {
  @ApiProperty({ description: 'Country name', example: 'United States' })
  country: string;

  @ApiProperty({ description: 'City name', example: 'New York' })
  city: string;

  @ApiProperty({ description: 'Country code (ISO)', example: 'US' })
  countryCode: string;
}

/** Identity session in list response */
export class IdentitySessionItemDto {
  @ApiProperty({
    description: 'Identity session unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionId: string;

  @ApiProperty({ description: 'Device metadata', type: SessionDeviceInfoDto })
  deviceInfo: SessionDeviceInfoDto;

  @ApiProperty({
    description: 'Client IP address when session was created',
    example: '192.168.1.1',
  })
  ipAddress: string;

  @ApiProperty({
    description:
      'Geo location from IP lookup (null if lookup disabled or failed)',
    type: SessionGeoLocationDto,
    nullable: true,
  })
  geoLocation: SessionGeoLocationDto | null;

  @ApiProperty({
    description: 'User-customizable session label (e.g. "Work laptop")',
    example: 'Work laptop',
    nullable: true,
  })
  sessionName: string | null;

  @ApiProperty({
    description: 'Session creation timestamp (ISO 8601)',
    example: '2026-01-15T08:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last activity timestamp (ISO 8601)',
    example: '2026-01-20T14:30:00.000Z',
  })
  lastActivityAt: string;

  @ApiProperty({
    description: 'True if this is the session used for the current request',
    example: false,
  })
  isCurrent: boolean;
}

/** Tenant session in list response */
export class TenantSessionItemDto {
  @ApiProperty({
    description: 'Tenant session unique identifier',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Tenant unique identifier',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  tenantId: string;

  @ApiProperty({ description: 'User role in tenant', example: 'tenant_admin' })
  role: string;

  @ApiProperty({
    description: 'Session creation timestamp (ISO 8601)',
    example: '2026-01-15T08:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last activity timestamp (ISO 8601)',
    example: '2026-01-20T14:30:00.000Z',
  })
  lastActivityAt: string;

  @ApiProperty({
    description:
      'True if this is the tenant session used for the current request',
    example: true,
  })
  isCurrent: boolean;
}
