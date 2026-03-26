import { UAParser } from 'ua-parser-js';
import type { DeviceInfo } from '../interfaces/session.interface';

/**
 * Parse User-Agent string into DeviceInfo for session metadata.
 */
export function parseUserAgent(userAgent: string | undefined): DeviceInfo {
  const parser = new UAParser(userAgent ?? '');
  const device = parser.getDevice();
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const osName = os.name || 'Unknown';
  const osVersion = (os.version || '').trim();
  const operatingSystem = `${osName} ${osVersion}`.trim();

  return {
    deviceType: device.type || 'desktop',
    browserName: browser.name || 'Unknown',
    browserVersion: browser.version || 'Unknown',
    operatingSystem,
  };
}
