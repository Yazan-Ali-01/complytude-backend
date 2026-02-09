import { GlobalRole } from 'src/common/types';

/**
 * Device information extracted from User-Agent string
 */
export interface DeviceInfo {
  deviceType: string; // 'mobile' | 'tablet' | 'desktop'
  browserName: string; // 'Chrome' | 'Firefox' | 'Safari' | etc.
  browserVersion: string;
  operatingSystem: string; // 'macOS 14.1' | 'Windows 11' | 'iOS 17.2' | etc.
}

/**
 * Geographic location information from MaxMind GeoLite2
 */
export interface GeoLocation {
  country: string; // Full country name
  city: string; // City name
  countryCode: string; // ISO 3166-1 alpha-2 country code
}

/**
 * Identity Session - Represents user's authenticated device/browser
 * Created once at login, persists across tenant switches
 *
 * Redis Key: identity-session:{identitySessionId}
 * TTL: 14 days (absolute max)
 */
export interface IdentitySession {
  userId: string;
  email: string;
  globalRoles: GlobalRole[];
  deviceInfo: DeviceInfo;
  ipAddress: string;
  geoLocation: GeoLocation | null; // null if lookup failed
  serviceName: string; // 'api' | 'mobile-ios' | 'mobile-android'
  sessionName: string | null; // User-customizable name (e.g., "My MacBook")
  activeTenantSessionIds: string[]; // Linked tenant sessions
  createdAt: string; // ISO 8601 timestamp
  lastActivityAt: string; // ISO 8601 timestamp
}

/**
 * Tenant Session - Represents active work within a specific tenant
 * Linked to parent identity session
 *
 * Redis Key: tenant-session:{tenantSessionId}
 * TTL: 14 days (absolute max, same as identity session)
 */
export interface TenantSession {
  userId: string;
  tenantId: string;
  role: string; // System role key (tenant_admin, legal_counsel, member, viewer)
  identitySessionId: string; // Parent identity session
  createdAt: string; // ISO 8601 timestamp
  lastActivityAt: string; // ISO 8601 timestamp
}

/**
 * Input for creating an identity session
 */
export interface CreateIdentitySessionInput {
  userId: string;
  email: string;
  globalRoles: GlobalRole[];
  deviceInfo: DeviceInfo;
  ipAddress: string;
  geoLocation: GeoLocation | null;
  serviceName: string;
  sessionName?: string | null;
}

/**
 * Input for creating a tenant session
 */
export interface CreateTenantSessionInput {
  userId: string;
  tenantId: string;
  role: string;
  identitySessionId: string;
}

/**
 * Session list response for user endpoints
 */
export interface SessionListItem {
  sessionId: string;
  sessionType: 'identity' | 'tenant';
  deviceInfo: DeviceInfo;
  ipAddress: string;
  geoLocation: GeoLocation | null;
  sessionName: string | null;
  tenantId?: string; // Only for tenant sessions
  createdAt: string;
  lastActivityAt: string;
  isCurrentSession: boolean;
}

/**
 * Session statistics for system admin
 */
export interface SessionStats {
  totalIdentitySessions: number;
  totalTenantSessions: number;
  sessionsByTenant: Record<string, number>;
  sessionsByDeviceType: Record<string, number>;
  activeUsersLast24h: number;
  activeUsersLast7d: number;
}
