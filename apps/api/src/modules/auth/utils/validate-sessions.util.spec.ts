import { UnauthorizedException } from '@nestjs/common';
import type { SessionService } from '../services/session.service';
import { validateSessions } from './validate-sessions.util';

function sessions(inactiveTenants: string[] = []): SessionService & {
  isTenantInactive: jest.Mock;
} {
  return {
    identitySessionExistsPure: jest.fn().mockResolvedValue(true),
    tenantSessionExistsPure: jest.fn().mockResolvedValue(true),
    touchIdentityActivity: jest.fn(),
    touchTenantActivity: jest.fn(),
    isTenantInactive: jest.fn((tenantId: string) =>
      Promise.resolve(inactiveTenants.includes(tenantId)),
    ),
  } as unknown as SessionService & { isTenantInactive: jest.Mock };
}

const tenantRequest = {
  auth: { tenant: { sessionId: 's1', tenantId: 't1' } },
};

describe('validateSessions', () => {
  it('accepts a live tenant session of an active tenant', async () => {
    await expect(
      validateSessions(sessions(), tenantRequest, { tenant: true }, false),
    ).resolves.toBeUndefined();
  });

  it('refuses a live tenant session once the tenant is deactivated', async () => {
    await expect(
      validateSessions(
        sessions(['t1']),
        tenantRequest,
        { tenant: true },
        false,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("doesn't check tenant status for identity-only requests", async () => {
    const service = sessions(['t1']);
    await expect(
      validateSessions(
        service,
        { auth: { identity: { sessionId: 'i1' } } },
        { identity: true },
        false,
      ),
    ).resolves.toBeUndefined();
    expect(service.isTenantInactive).not.toHaveBeenCalled();
  });
});
