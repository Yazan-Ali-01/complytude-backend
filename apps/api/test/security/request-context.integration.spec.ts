import { AuditService } from '@lib/audit';
import type { Queue } from '@lib/queue';
import { getQueueToken, QUEUE_NAMES } from '@lib/queue';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;

/**
 * The request's trace id and tenant follow it: into audit rows written while handling a request
 * with a body, and into the metadata of the jobs it queues (which workers bind to their logs).
 */
describe('Request context propagation', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: AuditService, useClass: AuditService }],
    });
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    await app.databaseService.query('DELETE FROM public.audit_logs');
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  async function tenantAdmin(): Promise<{
    tenantId: string;
    userId: string;
    cookie: string;
  }> {
    const tenant = await createTestTenant(app.module);
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    const identity = cookieHeaderFromSetCookie(login.headers as Headers);
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: identity },
      payload: { tenantId: tenant.id },
    });
    return {
      tenantId: tenant.id,
      userId: user.id,
      cookie: `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`,
    };
  }

  it('an audit row written for a request with a body carries its trace id', async () => {
    const own = await tenantAdmin();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { cookie: own.cookie },
      payload: { firstName: 'Traced' },
    });
    expect(response.statusCode).toBe(200);

    let traceId: string | null = null;
    for (let i = 0; i < 40 && !traceId; i++) {
      const { rows } = await app.databaseService.query<{
        trace_id: string | null;
      }>(
        `SELECT trace_id FROM public.audit_logs WHERE action = 'USER_PROFILE_UPDATED'`,
      );
      traceId = rows[0]?.trace_id ?? null;
      if (!traceId) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(traceId).toBe(response.headers['x-trace-id']);
  });

  it('a job queued by a tenant request carries the trace id and the tenant', async () => {
    const own = await tenantAdmin();
    const documentId = randomUUID();
    await app.databaseService.query(
      `INSERT INTO public.documents
         (id, tenant_id, title, source_type, s3_key, s3_bucket, original_filename,
          file_size_bytes, mime_type, extraction_status, created_by)
       VALUES ($1, $2, 'lease.pdf', 'file_upload', $3, 'mock-quarantine-bucket', 'lease.pdf',
               2048576, 'application/pdf', 'pending', $4)`,
      [
        documentId,
        own.tenantId,
        `tenants/${own.tenantId}/documents/${documentId}/document.pdf`,
        own.userId,
      ],
    );

    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/confirm-upload`,
      headers: { cookie: own.cookie },
    });
    expect(response.statusCode).toBe(202);

    const queue = app.module.get<Queue>(
      getQueueToken(QUEUE_NAMES.DATA_INGESTION),
    );
    const job = await queue.getJob(`doc-ingestion-${documentId}`);
    expect(
      (job?.data as { _metadata?: Record<string, unknown> })._metadata,
    ).toMatchObject({
      traceId: response.headers['x-trace-id'],
      tenantId: own.tenantId,
    });
    await job?.remove();
  });
});
