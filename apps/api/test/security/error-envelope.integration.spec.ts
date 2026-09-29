import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { DocumentsService } from 'src/modules/documents/documents.service';
import { createTestTenant, createTestUserInTenant } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

type Headers = Record<string, string | string[] | undefined>;

/**
 * Every error, from a route or from the framework before a route runs, leaves in the documented
 * envelope with the request's trace id, and never with SQL or internal messages.
 */
describe('Error envelope', () => {
  let app: TestApp;
  let server: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function expectEnvelope(
    response: LightMyRequestResponse,
    status: number,
  ): Record<string, unknown> {
    expect(response.statusCode).toBe(status);
    const body = response.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      statusCode: status,
      error: expect.any(String),
      message: expect.anything(),
      traceId: response.headers['x-trace-id'],
      path: expect.stringMatching(/^\/api\//),
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(JSON.stringify(body)).not.toMatch(/\bat \S+\.(ts|js):\d+/);
    return body;
  }

  async function tenantAdminCookie(): Promise<string> {
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
    return `${identity}; ${cookieHeaderFromSetCookie(switched.headers as Headers)}`;
  }

  it('an unknown route, a bad token and a validation error share the envelope', async () => {
    expectEnvelope(
      await server.inject({ method: 'GET', url: '/api/v1/nothing-here' }),
      404,
    );
    expectEnvelope(
      await server.inject({ method: 'GET', url: '/api/v1/documents' }),
      401,
    );
    expectEnvelope(
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'not-an-email', password: 'x' },
      }),
      400,
    );
  });

  it('framework errors before the route (bad JSON, too large, wrong content type) share it too, without framework text', async () => {
    const badJson = expectEnvelope(
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '{"email": ',
      }),
      400,
    );
    expect(JSON.stringify(badJson)).not.toMatch(
      /Unexpected|JSON at position|FST_/,
    );

    expectEnvelope(
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({
          email: 'a@b.com',
          password: 'x'.repeat(1_100_000),
        }),
      }),
      413,
    );

    expectEnvelope(
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'content-type': 'application/x-something' },
        payload: 'x',
      }),
      415,
    );
  });

  it('a unique violation that reaches the top is a 409, and a crash a 500, neither with internals', async () => {
    const cookie = await tenantAdminCookie();
    const documents = app.module.get(DocumentsService);

    jest
      .spyOn(documents, 'findAll')
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            'duplicate key value violates unique constraint "documents_pkey"',
          ),
          { code: '23505', severity: 'ERROR' },
        ),
      );
    const conflict = expectEnvelope(
      await server.inject({
        method: 'GET',
        url: '/api/v1/documents',
        headers: { cookie },
      }),
      409,
    );
    expect(JSON.stringify(conflict)).not.toContain('documents_pkey');

    jest
      .spyOn(documents, 'findAll')
      .mockRejectedValueOnce(new Error('SELECT secret FROM vault'));
    const crash = expectEnvelope(
      await server.inject({
        method: 'GET',
        url: '/api/v1/documents',
        headers: { cookie, 'accept-language': 'ar' },
      }),
      500,
    );
    expect(JSON.stringify(crash)).not.toContain('secret');
    // Translated like every other message
    expect(crash.message).toMatch(/[؀-ۿ]/);
  });
});
