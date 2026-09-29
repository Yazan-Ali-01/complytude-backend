import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSslOptions } from './ssl-options';

const BUNDLE = join(__dirname, '..', 'certs', 'rds-global-bundle.pem');

describe('buildSslOptions', () => {
  it('is off when TLS is disabled', () => {
    expect(
      buildSslOptions({
        enabled: false,
        rejectUnauthorized: true,
        caPath: BUNDLE,
      }),
    ).toBeUndefined();
  });

  it('verifies the server certificate against the given CA bundle', () => {
    const options = buildSslOptions({
      enabled: true,
      rejectUnauthorized: true,
      caPath: BUNDLE,
    });

    expect(options?.rejectUnauthorized).toBe(true);
    expect(options?.ca).toBe(readFileSync(BUNDLE, 'utf8'));
  });

  it('without a bundle still verifies (against the system roots)', () => {
    expect(
      buildSslOptions({ enabled: true, rejectUnauthorized: true }),
    ).toEqual({ rejectUnauthorized: true });
  });
});

describe('the shipped RDS CA bundle', () => {
  const certificates = readFileSync(BUNDLE, 'utf8')
    .split(/(?=-----BEGIN CERTIFICATE-----)/)
    .filter((block) => block.includes('BEGIN CERTIFICATE'))
    .map((pem) => new X509Certificate(pem));

  it('holds valid Amazon RDS CA certificates for the regions in use', () => {
    expect(certificates.length).toBeGreaterThan(10);
    expect(certificates.every((c) => c.ca)).toBe(true);
    const subjects = certificates.map((c) => c.subject).join('\n');
    expect(subjects).toContain('Amazon RDS eu-central-1');
    expect(subjects).toContain('Amazon RDS me-central-1');
  });
});
