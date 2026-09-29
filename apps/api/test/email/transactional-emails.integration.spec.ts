import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { SystemTenantRole } from 'src/common/types/tenant.types';
import { PaymentActionRequiredHandler } from 'src/modules/billing/handlers/payment-action-required.handler';
import { CreditNotificationHandler } from 'src/modules/entitlements/processors/credit-notification.handler';
import { QuotaExceededHandler } from 'src/modules/entitlements/processors/quota-exceeded.handler';
import { EmailService } from 'src/modules/email/email.service';
import {
  createTestSubscription,
  createTestTenant,
  createTestUserInTenant,
} from '../factories';
import { cookieHeaderFromSetCookie } from '../helpers/http-cookie.helper';
import { resetTestState } from '../helpers/redis-flush.helper';
import { createTestApp, TestApp } from '../setup/test-app.factory';

interface SentEmail {
  to: string[];
  subject: string;
  html: string;
  text: string;
  type: string;
  configurationSet?: string;
}

type Headers = Record<string, string | string[] | undefined>;

/**
 * Every flow that promises an email sends one, rendered and handed to SES (mocked here; the
 * rest of the suite skips sending). Arabic tenants get Arabic, right-to-left emails, and names
 * people choose are escaped.
 */
describe('Transactional emails (SES mocked)', () => {
  let app: TestApp;
  let server: FastifyInstance;
  let sent: SentEmail[];

  beforeAll(async () => {
    app = await createTestApp();
    server = app.app.getHttpAdapter().getInstance() as FastifyInstance;
    // .env.test sets EMAIL_SKIP_SEND (read when AppModule is imported); send for real here, into
    // the mocked SES client
    Object.assign(app.module.get(EmailService), { skipSend: false });
    // As SES_CONFIGURATION_SET sets it in a deployment
    (
      Reflect.get(app.module.get(EmailService), 'config') as {
        configurationSet?: string;
      }
    ).configurationSet = 'complytude-test';
  }, 60000);

  beforeEach(async () => {
    await resetTestState(app.databaseService, app.redisClient);
    sent = [];
    const recordSend = (command: SendEmailCommand): Promise<object> => {
      const input = command.input;
      sent.push({
        to: input.Destination?.ToAddresses ?? [],
        subject: input.Message?.Subject?.Data ?? '',
        html: input.Message?.Body?.Html?.Data ?? '',
        text: input.Message?.Body?.Text?.Data ?? '',
        type: input.Tags?.find((tag) => tag.Name === 'EmailType')?.Value ?? '',
        configurationSet: input.ConfigurationSetName,
      });
      return Promise.resolve({ MessageId: randomUUID() });
    };
    // send() also has a callback overload, so the mock is passed untyped
    jest
      .spyOn(SESClient.prototype, 'send')
      .mockImplementation(recordSend as never);
  }, 15000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (app) await app.cleanup();
  }, 30000);

  /** An Arabic tenant with a name that needs escaping, and its admin. */
  async function arabicTenant(): Promise<{
    tenantId: string;
    adminEmail: string;
  }> {
    const tenant = await createTestTenant(app.module, {
      name: '<b>Acme & Sons</b>',
    });
    await createTestSubscription(app.module, tenant.id, { planKey: 'shield' });
    await app.databaseService.query(
      `UPDATE public.tenants SET locale = 'ar' WHERE id = $1`,
      [tenant.id],
    );
    const { user } = await createTestUserInTenant(app.module, tenant.id, {
      role: SystemTenantRole.TENANT_ADMIN,
    });
    return { tenantId: tenant.id, adminEmail: user.email };
  }

  function expectArabicRtl(email: SentEmail): void {
    expect(email.html).toContain('<html lang="ar" dir="rtl">');
    expect(email.html).toContain('&lt;b&gt;Acme &amp; Sons&lt;/b&gt;');
    expect(email.html).not.toContain('<b>Acme');
    expect(email.text).toMatch(/[؀-ۿ]/);
  }

  it('invites by email, in the tenant language, and keeps the token out of the response', async () => {
    const { tenantId, adminEmail } = await arabicTenant();
    const login = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Test123!@#' },
    });
    const switched = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/tenant-switch',
      headers: { cookie: cookieHeaderFromSetCookie(login.headers as Headers) },
      payload: { tenantId },
    });
    const invitee = `invitee-${randomUUID()}@example.com`;

    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/tenants/admin/invitations',
      headers: {
        cookie: cookieHeaderFromSetCookie(switched.headers as Headers),
      },
      payload: { email: invitee },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ emailSent: true });
    expect(created.json()).not.toHaveProperty('token');
    const invitations = sent.filter((email) => email.type === 'invitation');
    expect(invitations).toHaveLength(1);
    expect(invitations[0].to).toEqual([invitee]);
    const token = /invite\?token=([0-9a-f]{64})/.exec(invitations[0].html)?.[1];
    expect(token).toBeDefined();
    expect(created.body).not.toContain(token);
    expectArabicRtl(invitations[0]);
  });

  it('every email names the SES configuration set and carries its EmailType tag', async () => {
    const email = `cs-${randomUUID()}@example.com`;
    const signup = () =>
      server.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email, password: 'Test123!@#' },
      });
    const verificationToken = (await signup()).json<{
      verificationToken: string;
    }>().verificationToken;
    await server.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: verificationToken },
    });
    await signup(); // the account now exists: the owner is told instead
    await server.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email },
    });
    // The account-exists send is not awaited by signup
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(sent.map((e) => e.type).sort()).toEqual([
      'account_exists',
      'password_reset',
      'verification',
    ]);
    expect(sent.every((e) => e.configurationSet === 'complytude-test')).toBe(
      true,
    );
  });

  describe('POST /auth/resend-verification', () => {
    async function signup(): Promise<{ email: string; firstToken: string }> {
      const email = `new-${randomUUID()}@example.com`;
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email, password: 'Test123!@#' },
      });
      expect(res.statusCode).toBe(201);
      return {
        email,
        firstToken: res.json<{ verificationToken: string }>().verificationToken,
      };
    }

    const resend = (email: string) =>
      server.inject({
        method: 'POST',
        url: '/api/v1/auth/resend-verification',
        payload: { email },
      });

    const verify = (token: string) =>
      server.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token },
      });

    it('mails a new link that works and ends the old one', async () => {
      const { email, firstToken } = await signup();
      sent = [];

      const res = await resend(email);

      expect(res.statusCode).toBe(200);
      expect(sent.map((e) => [e.type, e.to])).toEqual([
        ['verification', [email]],
      ]);
      const newToken = /token=([0-9a-f]{64})/.exec(sent[0].html)?.[1];
      expect(newToken).toBeDefined();
      expect((await verify(firstToken)).statusCode).toBe(400);
      expect((await verify(newToken!)).statusCode).toBe(200);
    });

    it('answers the same for unknown or verified accounts and sends nothing', async () => {
      const unknown = await resend(`nobody-${randomUUID()}@example.com`);
      const { email, firstToken } = await signup();
      await verify(firstToken);
      sent = [];
      const verified = await resend(email);

      expect(unknown.statusCode).toBe(200);
      expect(verified.json()).toEqual(unknown.json());
      expect(sent).toEqual([]);
    });

    it('sends at most one email a minute per address', async () => {
      const { email } = await signup();
      sent = [];

      await resend(email);
      await resend(email);
      await resend(email.toUpperCase());

      expect(sent).toHaveLength(1);
    });
  });

  describe('quota exceeded', () => {
    const job = (
      tenantId: string,
      featureKey: string,
      reason = 'quota_exceeded',
    ) =>
      ({
        data: {
          tenantId,
          featureKey,
          requestedUnits: 1,
          limit: 3,
          used: 3,
          reason,
        },
      }) as never;

    it('emails the admins once per feature and month, in Arabic', async () => {
      const { tenantId, adminEmail } = await arabicTenant();
      const handler = app.module.get(QuotaExceededHandler);

      await handler.execute(job(tenantId, 'documents_per_month'));
      await handler.execute(job(tenantId, 'documents_per_month'));
      await handler.execute(job(tenantId, 'contract_reviews_per_month'));
      await handler.execute(
        job(tenantId, 'documents_per_month', 'payment_required'),
      );

      expect(sent.map((e) => e.type)).toEqual([
        'quota_exceeded',
        'quota_exceeded',
      ]);
      expect(sent[0].to).toEqual([adminEmail]);
      expect(sent[0].text).toContain('المستندات المُنشأة');
      expectArabicRtl(sent[0]);
    });
  });

  describe('low credit balance', () => {
    const job = (
      tenantId: string,
      transactionType: 'deducted' | 'granted',
      amount: number,
      remainingBalance: number,
    ) =>
      ({
        data: { tenantId, transactionType, amount, remainingBalance },
      }) as never;

    it('emails when a deduction takes the balance below the threshold, and only then', async () => {
      const { tenantId } = await arabicTenant();
      const handler = app.module.get(CreditNotificationHandler);

      await handler.execute(job(tenantId, 'deducted', 5, 15)); // still above
      await handler.execute(job(tenantId, 'deducted', 5, 7)); // crosses 10
      await handler.execute(job(tenantId, 'deducted', 5, 2)); // already below
      await handler.execute(job(tenantId, 'granted', 5, 7));

      expect(sent.map((e) => e.type)).toEqual(['low_credit_balance']);
      expect(sent[0].text).toContain('7');
      expectArabicRtl(sent[0]);
    });
  });

  it('sends the payment-action email in the tenant language', async () => {
    const { tenantId, adminEmail } = await arabicTenant();

    await app.module.get(PaymentActionRequiredHandler).execute({
      data: {
        tenantId,
        tenantAdminEmail: adminEmail,
        tenantName: '<b>Acme & Sons</b>',
        invoiceId: 'in_test',
        hostedInvoiceUrl: 'https://invoice.stripe.test/in_test',
        amount: 5000,
        currency: 'aed',
      },
    } as never);

    expect(sent.map((e) => e.type)).toEqual(['payment_action_required']);
    expectArabicRtl(sent[0]);
  });
});
