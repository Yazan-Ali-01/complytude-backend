import type { IncomingMessage } from 'node:http';

import { getClientIp, isScannerPath, truncateIp } from './logger.utils';

describe('logger.utils', () => {
  describe('isScannerPath', () => {
    it.each([
      '/api/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
      '/.env',
      '/.env.production',
      '/.env.local?token=x',
      '/.git/config',
      '/.aws/credentials',
      '/wp-login.php',
      '/wp-admin/setup-config.php',
      '/phpmyadmin/index.php',
      '/cgi-bin/test.cgi',
      '/owa/auth/logon.aspx',
      '/manager/html',
      '/server-status',
      '/index.php',
      '/HNAP1/',
    ])('flags %s as a scanner path', (url) => {
      expect(isScannerPath(url)).toBe(true);
    });

    it.each([
      '/api/v1/auth/login',
      '/api/v1/documents',
      '/api/health',
      '/api/v1/.envelope', // legitimate-looking path that contains ".env"
      '/api/v1/git-integrations', // legitimate "git" in path
      undefined,
      '',
    ])('does not flag %s', (url) => {
      expect(isScannerPath(url)).toBe(false);
    });
  });

  describe('truncateIp', () => {
    it('zeroes the last octet of an IPv4 address', () => {
      expect(truncateIp('203.0.113.42')).toBe('203.0.113.0');
    });

    it('handles IPv4-mapped IPv6 as IPv4', () => {
      expect(truncateIp('::ffff:203.0.113.42')).toBe('203.0.113.0');
    });

    it('truncates a fully expanded IPv6 to /64', () => {
      expect(truncateIp('2001:db8:85a3:1:0:0:8a2e:7334')).toBe(
        '2001:db8:85a3:1::/64',
      );
    });

    it('truncates a zero-compressed IPv6 to /64', () => {
      expect(truncateIp('2001:db8:85a3:1::8a2e:7334')).toBe(
        '2001:db8:85a3:1::/64',
      );
    });

    it('truncates link-local IPv6 (compressed at the start)', () => {
      expect(truncateIp('fe80::1')).toBe('fe80:0:0:0::/64');
    });

    it('strips zone identifiers from link-local IPv6', () => {
      expect(truncateIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    });

    it('redacts malformed IPv6 with multiple "::"', () => {
      expect(truncateIp('2001::db8::1')).toBe('[REDACTED]');
    });

    it('redacts unrecognised input', () => {
      expect(truncateIp('not-an-ip')).toBe('[REDACTED]');
    });

    it('rejects out-of-range IPv4 octets', () => {
      expect(truncateIp('999.999.999.999')).toBe('[REDACTED]');
    });

    it('returns undefined for missing IP', () => {
      expect(truncateIp(undefined)).toBeUndefined();
      expect(truncateIp('')).toBeUndefined();
    });
  });

  describe('getClientIp', () => {
    function makeReq(
      headers: Record<string, string | string[] | undefined>,
      socketRemote?: string,
    ): IncomingMessage {
      return {
        headers,
        socket: socketRemote ? { remoteAddress: socketRemote } : undefined,
      } as unknown as IncomingMessage;
    }

    it('behind one proxy, takes the entry that proxy appended, not what the client wrote', () => {
      const req = makeReq(
        { 'x-forwarded-for': '6.6.6.6, 203.0.113.42' },
        '10.0.0.99',
      );
      expect(getClientIp(req, 1)).toBe('203.0.113.42');
    });

    it('counts hops across repeated X-Forwarded-For headers', () => {
      const req = makeReq(
        { 'x-forwarded-for': ['6.6.6.6, 203.0.113.42', '198.51.100.7'] },
        '10.0.0.99',
      );
      expect(getClientIp(req, 2)).toBe('203.0.113.42');
    });

    it('with no trusted proxy, ignores X-Forwarded-For entirely', () => {
      const req = makeReq({ 'x-forwarded-for': '6.6.6.6' }, '10.0.0.99');
      expect(getClientIp(req, 0)).toBe('10.0.0.99');
    });

    it('with fewer entries than hops, takes the furthest one', () => {
      const req = makeReq({ 'x-forwarded-for': '203.0.113.42' }, '10.0.0.99');
      expect(getClientIp(req, 3)).toBe('203.0.113.42');
    });

    it('falls back to the socket address without X-Forwarded-For', () => {
      expect(getClientIp(makeReq({}, '10.0.0.99'), 1)).toBe('10.0.0.99');
      expect(
        getClientIp(makeReq({ 'x-forwarded-for': '' }, '10.0.0.99'), 1),
      ).toBe('10.0.0.99');
    });

    it('returns undefined when no IP can be determined', () => {
      expect(getClientIp(makeReq({}), 1)).toBeUndefined();
    });
  });
});
