import { Injectable } from '@nestjs/common';
import { DeviceInfo } from 'src/modules/auth/interfaces/session.interface';
import { UAParser } from 'ua-parser-js';

/**
 * UserAgentParserService - Extract device information from User-Agent strings
 *
 * Uses ua-parser-js to parse browser, OS, and device type from User-Agent header
 *
 * Example User-Agent:
 * "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
 *
 * Parsed result:
 * {
 *   deviceType: 'desktop',
 *   browserName: 'Chrome',
 *   browserVersion: '120.0.0.0',
 *   operatingSystem: 'macOS 10.15.7'
 * }
 */
@Injectable()
export class UserAgentParserService {
  /**
   * Parse User-Agent string into structured device information
   *
   * @param userAgentString - User-Agent header value
   * @returns DeviceInfo - Structured device metadata
   */
  parse(userAgentString: string | undefined): DeviceInfo {
    if (!userAgentString) {
      return this.getDefaultDeviceInfo();
    }

    try {
      const parser = new UAParser(userAgentString);
      const deviceResult = parser.getDevice();
      const browserResult = parser.getBrowser();
      const osResult = parser.getOS();

      return {
        deviceType: this.normalizeDeviceType(deviceResult.type),
        browserName: browserResult.name || 'Unknown',
        browserVersion: browserResult.version || 'Unknown',
        operatingSystem: this.formatOS(osResult.name, osResult.version),
      };
    } catch {
      // Parsing failed - return default
      return this.getDefaultDeviceInfo();
    }
  }

  /**
   * Normalize device type to standard values
   * @param type - Raw device type from ua-parser-js
   * @returns 'mobile' | 'tablet' | 'desktop'
   */
  private normalizeDeviceType(type: string | undefined): string {
    if (!type) {
      return 'desktop'; // Default to desktop if unknown
    }

    const lowerType = type.toLowerCase();

    if (lowerType === 'mobile') {
      return 'mobile';
    }
    if (lowerType === 'tablet') {
      return 'tablet';
    }

    // All other types (wearable, console, tv, etc.) → desktop
    return 'desktop';
  }

  /**
   * Format OS name and version into readable string
   * @param name - OS name
   * @param version - OS version
   * @returns Formatted string like "macOS 14.1" or "Windows 11"
   */
  private formatOS(
    name: string | undefined,
    version: string | undefined,
  ): string {
    if (!name) {
      return 'Unknown';
    }

    if (!version) {
      return name;
    }

    return `${name} ${version}`.trim();
  }

  /**
   * Get default device info when parsing fails
   * @returns DeviceInfo with unknown values
   */
  private getDefaultDeviceInfo(): DeviceInfo {
    return {
      deviceType: 'desktop',
      browserName: 'Unknown',
      browserVersion: 'Unknown',
      operatingSystem: 'Unknown',
    };
  }
}
