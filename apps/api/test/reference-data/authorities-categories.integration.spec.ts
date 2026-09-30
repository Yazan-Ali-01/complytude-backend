import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemPlatformRole } from 'src/common/types/platform.types';
import { createTestUser } from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

/**
 * Reference data a platform admin manages: authorities and contract categories. Request DTOs
 * are camelCase (`isActive`, `parentId`); the columns are snake_case.
 */
describe('Authorities and categories (platform admin)', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    const admin = await createTestUser(app.module, {
      platform_role_key: SystemPlatformRole.SYSTEM_ADMIN,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password: 'Test123!@#' },
    });
    expect(login.statusCode).toBe(200);
    cookie = cookieHeaderFromSetCookie(
      login.headers as Record<string, string | string[] | undefined>,
    );
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  function call(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ) {
    return server.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie },
      ...(payload ? { payload } : {}),
    });
  }

  it('creates, updates and lists an authority', async () => {
    const code = `T${randomUUID().slice(0, 6).toUpperCase()}`;

    const created = await call('POST', '/authorities', {
      code,
      name: 'Test Free Zone Authority',
      isActive: false,
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    expect(created.json()).toMatchObject({ code, isActive: false });

    const updated = await call('PATCH', `/authorities/${id}`, {
      name: 'Renamed Authority',
      isActive: true,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: 'Renamed Authority',
      isActive: true,
      country: 'United Arab Emirates',
    });

    const listed = await call('GET', `/authorities?search=${code}`);
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).toContain(id);
  });

  it('creates a category under a parent and updates it', async () => {
    const suffix = randomUUID().slice(0, 6);

    const parent = await call('POST', '/categories', {
      code: `parent_${suffix}`,
      name: 'Parent category',
    });
    expect(parent.statusCode).toBe(201);
    const parentId = parent.json<{ id: string }>().id;

    const child = await call('POST', '/categories', {
      code: `child_${suffix}`,
      name: 'Child category',
      parentId,
      isActive: false,
    });
    expect(child.statusCode).toBe(201);
    expect(child.json()).toMatchObject({ parentId, isActive: false });

    const updated = await call(
      'PATCH',
      `/categories/${child.json<{ id: string }>().id}`,
      { isActive: true, description: 'Now active' },
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      parentId,
      isActive: true,
      description: 'Now active',
    });
  });
});
