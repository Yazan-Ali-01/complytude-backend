import { ConfigService } from '@nestjs/config';
import * as maxmind from 'maxmind';
import * as fs from 'node:fs';
import { GeoLocationService } from './geo-location.service';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('maxmind', () => ({
  openSync: jest.fn(),
  validate: jest.fn(),
}));

describe('GeoLocationService', () => {
  let service: GeoLocationService;
  const existsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
  const openSync = maxmind.openSync as jest.MockedFunction<
    typeof maxmind.openSync
  >;
  const validate = maxmind.validate as jest.MockedFunction<
    typeof maxmind.validate
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((k: string) =>
        k === 'geo.dbPath' ? './data/GeoLite2-City.mmdb' : undefined,
      ),
    } as unknown as ConfigService;
    service = new GeoLocationService(config);
    (service as unknown as { initAttempted: boolean }).initAttempted = false;
    (service as unknown as { reader: unknown }).reader = null;
  });

  it('returns null when ip is empty or unknown', async () => {
    await expect(service.lookup('')).resolves.toBeNull();
    await expect(service.lookup('unknown')).resolves.toBeNull();
  });

  it('returns null when geo db path is not configured', async () => {
    const config = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;
    const s = new GeoLocationService(config);
    await expect(s.lookup('8.8.8.8')).resolves.toBeNull();
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('returns null when database file is missing', async () => {
    existsSync.mockReturnValue(false);
    await expect(service.lookup('8.8.8.8')).resolves.toBeNull();
  });

  it('returns null when IP fails maxmind.validate', async () => {
    existsSync.mockReturnValue(true);
    openSync.mockReturnValue({ get: jest.fn() } as never);
    validate.mockReturnValue(false);
    await expect(service.lookup('10.0.0.1')).resolves.toBeNull();
  });

  it('maps CityResponse to GeoLocation when lookup succeeds', async () => {
    existsSync.mockReturnValue(true);
    validate.mockReturnValue(true);
    openSync.mockReturnValue({
      get: jest.fn().mockReturnValue({
        country: { names: { en: 'United Arab Emirates' }, iso_code: 'AE' },
        city: { names: { en: 'Dubai' } },
      }),
    } as never);

    const geo = await service.lookup('185.0.0.1');
    expect(geo).toEqual({
      country: 'United Arab Emirates',
      city: 'Dubai',
      countryCode: 'AE',
    });
  });

  it('returns null when reader get returns undefined', async () => {
    existsSync.mockReturnValue(true);
    validate.mockReturnValue(true);
    openSync.mockReturnValue({
      get: jest.fn().mockReturnValue(undefined),
    } as never);
    await expect(service.lookup('1.1.1.1')).resolves.toBeNull();
  });

  it('swallows sync open errors and leaves reader null', async () => {
    existsSync.mockReturnValue(true);
    openSync.mockImplementation(() => {
      throw new Error('corrupt db');
    });
    const config = {
      get: jest.fn((k: string) =>
        k === 'geo.dbPath' ? './bad.mmdb' : undefined,
      ),
    } as unknown as ConfigService;
    const s = new GeoLocationService(config);
    await expect(s.lookup('8.8.8.8')).resolves.toBeNull();
  });
});
