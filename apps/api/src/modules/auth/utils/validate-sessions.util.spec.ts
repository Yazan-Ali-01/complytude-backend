import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
      validateSessions(sessions(), tenantRequest, { tenant: true }),
    ).resolves.toBeUndefined();
  });

  it('refuses a live tenant session once the tenant is deactivated', async () => {
    await expect(
      validateSessions(sessions(['t1']), tenantRequest, { tenant: true }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("doesn't check tenant status for identity-only requests", async () => {
    const service = sessions(['t1']);
    await expect(
      validateSessions(
        service,
        { auth: { identity: { sessionId: 'i1' } } },
        { identity: true },
      ),
    ).resolves.toBeUndefined();
    expect(service.isTenantInactive).not.toHaveBeenCalled();
  });

  describe('when the session store (Redis) is unreachable', () => {
    const down = (): SessionService => {
      const service = sessions();
      const error = new Error('Connection is closed.');
      (service.identitySessionExistsPure as jest.Mock).mockRejectedValue(error);
      (service.tenantSessionExistsPure as jest.Mock).mockRejectedValue(error);
      return service;
    };

    it('refuses a tenant request (503), never falling back to the JWT alone', async () => {
      await expect(
        validateSessions(down(), tenantRequest, { tenant: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('refuses an identity request (503)', async () => {
      await expect(
        validateSessions(
          down(),
          { auth: { identity: { sessionId: 'i1' } } },
          { identity: true },
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('still answers 401 for a session that is known to be gone', async () => {
      const service = sessions();
      (service.tenantSessionExistsPure as jest.Mock).mockResolvedValue(false);
      await expect(
        validateSessions(service, tenantRequest, { tenant: true }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
