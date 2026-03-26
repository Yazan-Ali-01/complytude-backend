import { registerAs } from '@nestjs/config';

/**
 * MaxMind GeoIP configuration.
 * Geo lookup is disabled when MAXMIND_DB_PATH is empty or the database file does not exist.
 */
export default registerAs('geo', () => ({
  /** License key for downloading GeoLite2 databases (required for download script) */
  licenseKey: process.env.MAXMIND_LICENSE_KEY || '',
  /** Path to GeoLite2-City.mmdb (relative to cwd or absolute). Empty = geo disabled. */
  dbPath: process.env.MAXMIND_DB_PATH ?? './data/GeoLite2-City.mmdb',
}));
