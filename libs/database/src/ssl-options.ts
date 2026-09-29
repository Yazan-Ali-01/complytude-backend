import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

export interface DatabaseSslConfig {
  enabled: boolean;
  /** Verify the server certificate (never turn off outside local development). */
  rejectUnauthorized: boolean;
  /** CA bundle to verify against: RDS certificates chain to the Amazon RDS CAs, which Node doesn't ship. */
  caPath?: string;
}

/**
 * TLS options for the pg pool: undefined when TLS is off; otherwise the server certificate is
 * verified (against `caPath` when given), so an in-VPC impostor can't collect credentials.
 */
export function buildSslOptions(
  config: DatabaseSslConfig,
): ConnectionOptions | undefined {
  if (!config.enabled) return undefined;
  return {
    rejectUnauthorized: config.rejectUnauthorized,
    ...(config.caPath && { ca: readFileSync(config.caPath, 'utf8') }),
  };
}
