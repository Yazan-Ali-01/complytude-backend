import { registerAs } from '@nestjs/config';

/**
 * MaxMind GeoIP configuration.
 * Geo lookup is disabled when MAXMIND_DB_PATH is empty or the database file does not exist. The
 * licence key is a build secret (apps/api/Dockerfile, scripts/download-geolite2-city.sh), not runtime
 * configuration.
 */
export default registerAs('geo', () => ({
  /** Path to GeoLite2-City.mmdb (relative to cwd or absolute). Empty = geo disabled. */
  dbPath: process.env.MAXMIND_DB_PATH ?? './data/GeoLite2-City.mmdb',
}));
