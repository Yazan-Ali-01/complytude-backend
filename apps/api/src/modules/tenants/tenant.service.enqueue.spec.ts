import { Logger } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import { TenantService } from './tenant.service';

// uuid@13 is ESM-only; the unit project doesn't transform it
jest.mock('uuid', () => ({
  v4: (): string => '00000000-0000-4000-8000-000000000000',
}));

/**
 * The Stripe-customer job is enqueued after the tenant is committed. If Redis rejects it, tenant
 * creation must still succeed (checkout creates the customer lazily) and the rejection must not
 * become an unhandled promise rejection, which would terminate the API process.
 */
describe('TenantService.createTenantForUser when the queue rejects', () => {
  let unhandled: jest.Mock;
  let loggedErrors: string[];

  beforeEach(() => {
    loggedErrors = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        loggedErrors.push(String(message));
      });
    unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    jest.restoreAllMocks();
  });

  it('returns the tenant, logs the failed enqueue, and leaves no unhandled rejection', async () => {
    const tenant = { id: 'tenant-1', name: 'Acme' };
    const queueProducer = {
      enqueue: jest
        .fn()
        .mockRejectedValue(new Error('Connection is closed (Redis)')),
    };
    const service = new TenantService(
      {} as never, // databaseService
      {} as never, // tenantRepository
      queueProducer as never,
      {} as never, // subscriptionsService
      {} as never, // userTenantRepository
      { t: (key: string) => key } as unknown as I18nService,
    );
    // The transactional part is covered elsewhere; this test is about what happens after it.
    jest
      .spyOn(
        service as unknown as { executeInTenantScope: () => Promise<unknown> },
        'executeInTenantScope',
      )
      .mockResolvedValue(tenant);

    const result = await service.createTenantForUser(
      'user-1',
      'owner@example.com',
      { name: 'Acme' } as never,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result).toBe(tenant);
    expect(queueProducer.enqueue).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    expect(loggedErrors).toContainEqual(
      expect.stringContaining(
        'Could not enqueue Stripe customer creation for tenant tenant-1',
      ),
    );
  });
});
