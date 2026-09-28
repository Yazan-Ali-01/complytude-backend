import { AuditService } from '@lib/audit';
import type {
  FastifyInstance,
  InjectOptions,
  LightMyRequestResponse,
} from 'fastify';
import { randomUUID } from 'node:crypto';
import { createTestUser } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const AUDIT_ACTION = 'USER_PROFILE_UPDATED';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface AuditRow {
  ip_address: string | null;
  trace_id: string | null;
  user_agent: string | null;
}

/**
 * Client-controlled headers can neither forge the audit row's IP nor stop the row being written.
 * The test app trusts one proxy (TRUST_PROXY_HOPS=1), as behind the ALB: the ALB appends the
 * address it saw to X-Forwarded-For, so that right-most entry is the client. Real AuditService.
 */
describe('Audit rows under forged or oversized client headers', () => {
  let app: TestApp;
  let fastify: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: AuditService, useClass: AuditService }],
    });
    fastify = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.audit_logs');
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** A signed-in user's profile update, which records USER_PROFILE_UPDATED. */
  async function audited(
    headers: InjectOptions['headers'],
  ): Promise<LightMyRequestResponse> {
    const user = await createTestUser(app.module);
    const signedIn = await fastify.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    return fastify.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      payload: { firstName: 'Mariam' },
      headers: {
        ...headers,
        cookie: cookieHeaderFromSetCookie(
          signedIn.headers as Record<string, string | string[] | undefined>,
        ),
      },
    });
  }

  /** The audit write is fire-and-forget: wait for it. */
  async function auditRow(): Promise<AuditRow> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const { rows } = await app.databaseService.query<AuditRow>(
        'SELECT ip_address, trace_id, user_agent FROM public.audit_logs WHERE action = $1',
        [AUDIT_ACTION],
      );
      if (rows.length > 0) return rows[0];
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('no audit row was written');
  }

  it('records the ALB-reported IP, not the entries the client wrote', async () => {
    const response = await audited({
      'x-forwarded-for': '6.6.6.6, 203.0.113.7',
    });

    expect(response.statusCode).toBe(200);
    expect((await auditRow()).ip_address).toBe('203.0.113.7');
  });

  it('still writes the row when X-Forwarded-For and the request id are oversized', async () => {
    const response = await audited({
      'x-forwarded-for': `${'1'.repeat(200)}, 203.0.113.8`,
      'x-request-id': 'r'.repeat(200),
      'x-trace-id': '<script>',
      'user-agent': 'u'.repeat(5000),
    });

    expect(response.statusCode).toBe(200);
    const row = await auditRow();
    expect(row.ip_address).toBe('203.0.113.8');
    expect(row.user_agent).toHaveLength(512);
    // A fresh id replaced the forged one
    expect(response.headers['x-trace-id']).toMatch(UUID);
    expect(row.trace_id).not.toBe('r'.repeat(200));
  });

  it('keeps a well-formed request id from the caller', async () => {
    const requestId = `client-${randomUUID()}`;

    const response = await audited({ 'x-request-id': requestId });

    expect(response.headers['x-trace-id']).toBe(requestId);
  });

  it('writes a row when a caller hands AuditService values wider than the columns', async () => {
    // Before normalisation this INSERT failed on the column widths and the row was lost
    await app.module.get(AuditService).log({
      action: AUDIT_ACTION,
      resourceType: 'r'.repeat(300),
      resourceId: 'i'.repeat(2000),
      ipAddress: 'not-an-ip-address-at-all-and-longer-than-45-characters',
      traceId: 't'.repeat(100),
      actorType: 'system',
    });

    const row = await auditRow();
    expect(row.ip_address).toBeNull();
    expect(row.trace_id).toBeNull();
  });
});
