import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EntitlementCheckResult } from 'src/common/types/entitlement.types';
import type { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { UsageEnforcementGuard } from './usage-enforcement.guard';

function context(): ExecutionContext {
  const request = {
    auth: { tenant: { tenantId: 't1', userId: 'u1' } },
    url: '/documents/generate',
    method: 'POST',
  };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardReturning(result: EntitlementCheckResult): UsageEnforcementGuard {
  const reflector = {
    getAllAndOverride: () => ({
      featureKey: 'documents_per_month',
      units: 1,
    }),
  } as unknown as Reflector;
  return new UsageEnforcementGuard(reflector, {
    checkAndRecord: jest.fn().mockResolvedValue(result),
  } as unknown as EntitlementEnforcementService);
}

async function denial(result: EntitlementCheckResult): Promise<HttpException> {
  const error: unknown = await guardReturning(result)
    .canActivate(context())
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe('UsageEnforcementGuard', () => {
  it('allows usage the enforcement service allows', async () => {
    await expect(
      guardReturning({ allowed: true, source: 'plan' }).canActivate(context()),
    ).resolves.toBe(true);
  });

  it('answers 402 payment_required, not a quota error, when the payment is overdue', async () => {
    const error = await denial({
      allowed: false,
      reason: 'payment_required',
      limit: 0,
    });

    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toMatchObject({
      reason: 'payment_required',
      feature: 'documents_per_month',
    });
    expect(error.getResponse()).not.toHaveProperty('upgradeUrl');
  });

  it('answers 402 with the quota details when the quota is used up', async () => {
    const error = await denial({
      allowed: false,
      reason: 'quota_exceeded',
      limit: 3,
      used: 3,
    });

    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(error.getResponse()).toMatchObject({
      limit: 3,
      used: 3,
      upgradeUrl: '/plans',
    });
    expect(error.getResponse()).not.toHaveProperty('reason');
  });
});
