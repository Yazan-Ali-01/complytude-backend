import { FastifyInstance, InjectOptions } from 'fastify';
import { I18nService } from 'nestjs-i18n';
import { CommonI18n } from 'src/common/constants/i18n.constants';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { BillingI18n } from 'src/modules/stripe/constants/i18n.constants';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

const ARABIC = /[؀-ۿ]/;

/**
 * Errors reach the client in the request's language: permission denials, platform access and
 * billing errors included (they were hardcoded English).
 */
describe('Error messages in the request language', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let i18n: I18nService;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    i18n = app.module.get(I18nService);
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
  }, 15000);

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  type Headers = Record<string, string | string[] | undefined>;

  /** A free-plan tenant member, signed in: identity cookies, and tenant cookies after the switch. */
  async function signedIn(
    role: SystemTenantRole,
  ): Promise<{ identity: string; tenant: string }> {
    const tenant = await createTestTenant(app.module);
    await createTestSubscription(app.module, tenant.id, {
      planKey: 'navigator',
    });
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role,
    });
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: 'Test123!@#' },
    });
    expect(login.statusCode).toBe(200);
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: cookieHeaderFromSetCookie(login.headers as Headers) },
      payload: { tenantId: tenant.id },
    });
    expect(switched.statusCode).toBe(200);
    return {
      identity: cookieHeaderFromSetCookie(login.headers as Headers),
      tenant: cookieHeaderFromSetCookie(switched.headers as Headers),
    };
  }

  async function error(
    request: InjectOptions,
  ): Promise<{ statusCode: number; message: string }> {
    const res = await server.inject(request);
    return {
      statusCode: res.statusCode,
      message: res.json<{ message: string }>().message,
    };
  }

  it('a missing tenant permission is refused in Arabic, and in English by default', async () => {
    const { tenant: cookie } = await signedIn(SystemTenantRole.VIEWER);
    const request: InjectOptions = {
      method: 'POST',
      url: '/api/v1/billing/subscription/cancel',
      headers: { cookie, 'x-lang': 'ar' },
    };
    const args = { permissions: 'billing:manage' };

    const arabic = await error(request);
    expect(arabic).toEqual({
      statusCode: 403,
      message: i18n.t(CommonI18n.errors.PERMISSION_REQUIRED_ANY, {
        lang: 'ar',
        args,
      }),
    });
    expect(arabic.message).toMatch(ARABIC);
    expect(arabic.message).toContain('billing:manage');

    const english = await error({ ...request, headers: { cookie } });
    expect(english.message).toBe(
      i18n.t(CommonI18n.errors.PERMISSION_REQUIRED_ANY, { lang: 'en', args }),
    );
  });

  it('a billing error is in Arabic', async () => {
    const { tenant: cookie } = await signedIn(SystemTenantRole.TENANT_ADMIN);

    const res = await error({
      method: 'POST',
      url: '/api/v1/billing/subscription/cancel',
      headers: { cookie, 'accept-language': 'ar' },
    });

    expect(res).toEqual({
      statusCode: 400,
      message: i18n.t(BillingI18n.errors.NO_SUBSCRIPTION_TO_CANCEL, {
        lang: 'ar',
      }),
    });
    expect(res.message).toMatch(ARABIC);
  });

  it('platform access without a platform role is refused in Arabic', async () => {
    const { identity: cookie } = await signedIn(SystemTenantRole.TENANT_ADMIN);

    const res = await error({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: { cookie, 'x-lang': 'ar' },
    });

    expect(res).toEqual({
      statusCode: 403,
      message: i18n.t(CommonI18n.errors.PLATFORM_ROLE_REQUIRED, {
        lang: 'ar',
      }),
    });
    expect(res.message).toMatch(ARABIC);
  });
});
