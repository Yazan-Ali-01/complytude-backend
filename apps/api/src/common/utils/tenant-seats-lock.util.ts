import type { PoolClient } from 'pg';

/**
 * Serialises everything that adds a member to a tenant (invite, accept, reactivate) until the
 * transaction ends: each one counts the seats after the previous one committed, so concurrent
 * requests can't all see the last free seat.
 */
export async function lockTenantSeats(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
    `tenant_seats:${tenantId}`,
  ]);
}
