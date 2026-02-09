import { ApiProperty } from '@nestjs/swagger';

/**
 * Device information for session
 */
export class DeviceInfoDto {
  @ApiProperty({
    description: 'Device type',
    example: 'desktop',
    enum: ['mobile', 'tablet', 'desktop'],
  })
  deviceType: string;

  @ApiProperty({
    description: 'Browser name',
    example: 'Chrome',
  })
  browserName: string;

  @ApiProperty({
    description: 'Browser version',
    example: '120.0.0.0',
  })
  browserVersion: string;

  @ApiProperty({
    description: 'Operating system',
    example: 'macOS 14.1',
  })
  operatingSystem: string;
}

/**
 * Geographic location for session
 */
export class GeoLocationDto {
  @ApiProperty({
    description: 'Country name',
    example: 'United States',
  })
  country: string;

  @ApiProperty({
    description: 'City name',
    example: 'New York',
  })
  city: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code',
    example: 'US',
  })
  countryCode: string;
}

/**
 * Session list item response
 */
export class SessionListItemDto {
  @ApiProperty({
    description: 'Session ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Session type',
    enum: ['identity', 'tenant'],
    example: 'identity',
  })
  sessionType: 'identity' | 'tenant';

  @ApiProperty({
    description: 'Device information',
    type: DeviceInfoDto,
  })
  deviceInfo: DeviceInfoDto;

  @ApiProperty({
    description: 'IP address',
    example: '203.0.113.42',
  })
  ipAddress: string;

  @ApiProperty({
    description: 'Geographic location (null if unavailable)',
    type: GeoLocationDto,
    nullable: true,
  })
  geoLocation: GeoLocationDto | null;

  @ApiProperty({
    description: 'User-customizable session name',
    example: 'My MacBook Pro',
    nullable: true,
  })
  sessionName: string | null;

  @ApiProperty({
    description: 'Tenant ID (only for tenant sessions)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  tenantId?: string;

  @ApiProperty({
    description: 'Session creation timestamp',
    example: '2026-02-09T15:30:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last activity timestamp',
    example: '2026-02-09T16:45:00.000Z',
  })
  lastActivityAt: string;

  @ApiProperty({
    description: 'Whether this is the current session making the request',
    example: true,
  })
  isCurrentSession: boolean;
}

/**
 * Session list response
 */
export class SessionListResponseDto {
  @ApiProperty({
    description: 'List of active sessions',
    type: [SessionListItemDto],
  })
  sessions: SessionListItemDto[];

  @ApiProperty({
    description: 'Total number of sessions',
    example: 3,
  })
  total: number;
}

/**
 * Session statistics (for system admin)
 */
export class SessionStatsDto {
  @ApiProperty({
    description: 'Total identity sessions',
    example: 150,
  })
  totalIdentitySessions: number;

  @ApiProperty({
    description: 'Total tenant sessions',
    example: 423,
  })
  totalTenantSessions: number;

  @ApiProperty({
    description: 'Sessions per tenant',
    example: { 'tenant-1': 45, 'tenant-2': 78 },
  })
  sessionsByTenant: Record<string, number>;

  @ApiProperty({
    description: 'Sessions per device type',
    example: { mobile: 120, tablet: 30, desktop: 273 },
  })
  sessionsByDeviceType: Record<string, number>;

  @ApiProperty({
    description: 'Active users in last 24 hours',
    example: 89,
  })
  activeUsersLast24h: number;

  @ApiProperty({
    description: 'Active users in last 7 days',
    example: 142,
  })
  activeUsersLast7d: number;
}
