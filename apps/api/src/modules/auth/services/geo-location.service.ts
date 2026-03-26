import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CityResponse } from 'maxmind';
import * as maxmind from 'maxmind';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GeoLocation } from '../interfaces/session.interface';

/**
 * GeoLocation service for IP lookups using MaxMind GeoLite2-City database.
 *
 * - Geo is disabled when MAXMIND_LICENSE_KEY is empty or MAXMIND_DB_PATH file does not exist
 * - Lookups never block: fire-and-forget for session enrichment
 * - All failures return null — never throws
 *
 * @see docs/ARCHITECTURE.md — Session management
 * @see scripts/README.md — GeoLite2-City download instructions
 */
@Injectable()
export class GeoLocationService implements OnModuleInit {
  private readonly logger = new Logger(GeoLocationService.name);
  private reader: maxmind.Reader<CityResponse> | null = null;
  private initAttempted = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.tryInitReader();
  }

  /**
   * Try to load the GeoLite2-City database synchronously.
   * If disabled or file missing, reader stays null.
   */
  private tryInitReader(): void {
    if (this.initAttempted) return;
    this.initAttempted = true;

    const dbPath = this.config.get<string>('geo.dbPath');
    if (!dbPath || dbPath.trim() === '') {
      this.logger.debug('Geo lookup disabled: MAXMIND_DB_PATH not set');
      return;
    }

    const resolvedPath = path.isAbsolute(dbPath)
      ? dbPath
      : path.resolve(process.cwd(), dbPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `Geo lookup disabled: database file not found at ${resolvedPath}`,
      );
      return;
    }

    try {
      this.reader = maxmind.openSync<CityResponse>(resolvedPath);
      this.logger.log('GeoLocationService: GeoLite2-City database loaded');
    } catch (err) {
      this.logger.warn(
        `Geo lookup disabled: failed to open database: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Look up geo location from IP address.
   * Returns null if geo is disabled, IP is private/invalid, or lookup fails.
   */
  async lookup(ip: string): Promise<GeoLocation | null> {
    if (!ip || ip === 'unknown') return null;

    return new Promise<GeoLocation | null>((resolve) => {
      this.tryInitReader();

      if (!this.reader) {
        resolve(null);
        return;
      }

      try {
        if (!maxmind.validate(ip)) {
          resolve(null);
          return;
        }

        const response = this.reader.get(ip);
        if (!response) {
          resolve(null);
          return;
        }

        const country =
          response.country?.names?.en ??
          response.registered_country?.names?.en ??
          '';
        const city = response.city?.names?.en ?? '';
        const countryCode =
          response.country?.iso_code ??
          response.registered_country?.iso_code ??
          '';

        if (!country && !city && !countryCode) {
          resolve(null);
          return;
        }

        resolve({
          country: country || 'Unknown',
          city: city || 'Unknown',
          countryCode: countryCode || 'XX',
        });
      } catch {
        resolve(null);
      }
    });
  }
}
