/**
 * Session interfaces for Redis-backed session management.
 * Dual-layer model: identity sessions (device) + tenant sessions (work context).
 *
 * @see docs/ARCHITECTURE.md - Session management architecture
 */

/** Parsed device metadata from User-Agent */
export interface DeviceInfo {
  deviceType: string; // mobile | desktop | tablet
  browserName: string; // Chrome, Firefox, Safari
  browserVersion: string;
  operatingSystem: string; // macOS, Windows, iOS, Android
}

/** Geo location from MaxMind GeoLite2 lookup */
export interface GeoLocation {
  country: string;
  city: string;
  countryCode: string;
}

/** Identity session — represents the user's authenticated browser/device */
export interface IdentitySessionData {
  userId: string;
  email: string;
  platformRole: string | null;
  isVerified: boolean;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  geoLocation: GeoLocation | null;
  sessionName: string | null;
  activeTenantSessionIds: string[];
  createdAt: string; // ISO timestamp
  lastActivityAt: string; // ISO timestamp
}

/** Tenant session — represents active work within a specific tenant */
export interface TenantSessionData {
  userId: string;
  tenantId: string;
  role: string;
  identitySessionId: string; // Parent identity session
  createdAt: string; // ISO timestamp
  lastActivityAt: string; // ISO timestamp
}
