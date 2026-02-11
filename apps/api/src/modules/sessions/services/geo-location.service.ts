import { Reader, ReaderModel } from '@maxmind/geoip2-node';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { GeoLocation } from 'src/modules/auth/interfaces/session.interface';

/**
 * GeoLocationService - IP geolocation using MaxMind GeoLite2
 *
 * Features:
 * - Local database lookup (~1μs per lookup, no network latency)
 * - Graceful failure handling (never blocks session creation)
 * - Optional MaxMind license key (disabled if not provided)
 * - Returns null on any failure (invalid IP, DB not found, etc.)
 *
 * Setup Instructions:
 * 1. Create MaxMind account: https://www.maxmind.com/en/geolite2/signup
 * 2. Generate license key: https://www.maxmind.com/en/accounts/current/license-key
 * 3. Download GeoLite2-City database:
 *    - Manual: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
 *    - OR use geoipupdate tool: https://github.com/maxmind/geoipupdate
 * 4. Place GeoLite2-City.mmdb in ./data/ directory
 * 5. Set MAXMIND_LICENSE_KEY and MAXMIND_DB_PATH in .env
 *
 * Database Updates:
 * - GeoLite2 updated weekly by MaxMind
 * - Use geoipupdate tool for automatic weekly updates
 * - Or manually download and replace database file
 *
 * Note: If license key or database file is missing, geo lookup is gracefully
 * disabled. Sessions will be created with geoLocation: null.
 */
@Injectable()
export class GeoLocationService implements OnModuleInit {
  private readonly logger = new Logger(GeoLocationService.name);
  private reader: ReaderModel | null = null;
  private isEnabled = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeReader();
  }

  /**
   * Initialize MaxMind GeoIP2 reader
   * Gracefully handles missing database file
   *
   * ARCHITECTURE: Separation of Concerns
   * - License key: ONLY for downloading database (build-time dependency)
   * - Database file: ONLY requirement for runtime lookup
   * - Reader.open() doesn't need license key (reads from local file)
   *
   * Best Practice: Don't require credentials/keys that aren't used at runtime
   *
   * Note: MaxMind GeoIP is OPTIONAL. If database file doesn't exist,
   * sessions are created with geoLocation: null. This is expected in development.
   */
  private async initializeReader(): Promise<void> {
    try {
      const dbPath = this.configService.get<string>('MAXMIND_DB_PATH');

      // Validate database path is configured
      if (!dbPath || dbPath.trim() === '') {
        this.logger.log(
          'MaxMind GeoIP is disabled (MAXMIND_DB_PATH not configured). ' +
            'This is optional - sessions will be created without geolocation data.',
        );
        return;
      }

      // Check if database file exists
      if (!fs.existsSync(dbPath)) {
        this.logger.log(
          `MaxMind GeoIP database not found at ${dbPath}. ` +
            `Geolocation is disabled (optional feature). ` +
            `\n` +
            `To enable geolocation:\n` +
            `  1. Create MaxMind account: https://www.maxmind.com/en/geolite2/signup\n` +
            `  2. Download GeoLite2-City.mmdb (license key needed for download only)\n` +
            `  3. Place file at: ${dbPath}\n` +
            `  4. Restart application`,
        );
        return;
      }

      // Open database reader (no license key needed - file-based lookup)
      this.reader = await Reader.open(dbPath);
      this.isEnabled = true;

      this.logger.log(
        `✅ MaxMind GeoIP initialized successfully. Database: ${dbPath}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize MaxMind GeoIP: ${error.message}. ` +
          `Geolocation lookups will be disabled.`,
        error.stack,
      );
      this.reader = null;
      this.isEnabled = false;
    }
  }

  /**
   * Lookup geolocation for an IP address
   * Returns null on any failure (never throws)
   *
   * @param ipAddress - IPv4 or IPv6 address
   * @returns GeoLocation | null
   */
  lookup(ipAddress: string | undefined): GeoLocation | null {
    // Geo lookup disabled
    if (!this.isEnabled || !this.reader) {
      return null;
    }

    // Invalid IP address
    if (!ipAddress) {
      return null;
    }

    // Skip localhost and private IPs (no geolocation data)
    if (this.isPrivateOrLocalhost(ipAddress)) {
      return null;
    }

    try {
      // Note: ReaderModel.city() is synchronous
      const response = this.reader.city(ipAddress);

      // Extract location data from the response
      const country = response?.country?.names?.en || 'Unknown';
      const city = response?.city?.names?.en || 'Unknown';
      const countryCode = response?.country?.isoCode || 'XX';

      return {
        country,
        city,
        countryCode,
      };
    } catch (error) {
      // Lookup failed (invalid IP, not in database, etc.)
      // Log at debug level to avoid noise
      this.logger.debug(
        `Geolocation lookup failed for IP ${ipAddress}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Check if IP is private or localhost
   * These IPs don't have geolocation data
   *
   * @param ipAddress - IP address to check
   * @returns boolean
   */
  private isPrivateOrLocalhost(ipAddress: string): boolean {
    // Localhost
    if (
      ipAddress === '127.0.0.1' ||
      ipAddress === '::1' ||
      ipAddress === 'localhost'
    ) {
      return true;
    }

    // Private IPv4 ranges
    const privateIPv4Patterns = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
    ];

    return privateIPv4Patterns.some((pattern) => pattern.test(ipAddress));
  }

  /**
   * Check if geolocation is enabled
   * @returns boolean
   */
  isGeoLocationEnabled(): boolean {
    return this.isEnabled;
  }
}
