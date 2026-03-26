import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import passport from 'passport';
import { SessionService } from '../services/session.service';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('passport', () => ({
  __esModule: true,
  default: {
    authenticate: jest.fn(),
  },
}));

function createContext(req: {
  auth?: Record<string, unknown>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getData: () => undefined }),
    switchToWs: () => ({ getClient: () => undefined }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let sessionService: jest.Mocked<
    Pick<
      SessionService,
      | 'identitySessionExistsPure'
      | 'tenantSessionExistsPure'
      | 'touchIdentityActivity'
      | 'touchTenantActivity'
    >
  >;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    sessionService = {
      identitySessionExistsPure: jest.fn(),
      tenantSessionExistsPure: jest.fn(),
      touchIdentityActivity: jest.fn(),
      touchTenantActivity: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        SessionService,
        | 'identitySessionExistsPure'
        | 'tenantSessionExistsPure'
        | 'touchIdentityActivity'
        | 'touchTenantActivity'
      >
    >;

    guard = new JwtAuthGuard(
      reflector,
      sessionService as unknown as SessionService,
    );
  });

  it('allows access when no auth options are set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ok = await guard.canActivate(createContext({}));
    expect(ok).toBe(true);
    expect(sessionService.identitySessionExistsPure).not.toHaveBeenCalled();
  });

  it('throws when tenant token required but passport did not attach user', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tenant: true,
      identity: false,
    });
    (passport.authenticate as jest.Mock).mockImplementation(
      (_s: string, _o: unknown, cb: (e: Error | null, u?: unknown) => void) => {
        return () => cb(null, undefined);
      },
    );
    await expect(
      guard.canActivate(createContext({ auth: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates identity session and touches activity', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      identity: true,
      tenant: false,
    });
    sessionService.identitySessionExistsPure.mockResolvedValue(true);

    const req: { auth?: Record<string, unknown> } = { auth: {} };
    (passport.authenticate as jest.Mock).mockImplementation(
      (_s: string, _o: unknown, cb: (e: Error | null, u?: unknown) => void) => {
        return () =>
          cb(null, {
            userId: 'u1',
            email: 'a@b.com',
            sessionId: 'iid',
            isVerified: true,
            platformRole: null,
          });
      },
    );

    const ctx = createContext(req);
    await guard.canActivate(ctx);

    expect(sessionService.identitySessionExistsPure).toHaveBeenCalledWith(
      'iid',
    );
    expect(sessionService.touchIdentityActivity).toHaveBeenCalledWith('iid');
  });

  it('throws Unauthorized when session does not exist in Redis', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      identity: true,
      tenant: false,
    });
    sessionService.identitySessionExistsPure.mockResolvedValue(false);

    (passport.authenticate as jest.Mock).mockImplementation(
      (_s: string, _o: unknown, cb: (e: Error | null, u?: unknown) => void) => {
        return () =>
          cb(null, {
            userId: 'u1',
            sessionId: 'gone',
          });
      },
    );

    await expect(
      guard.canActivate(createContext({ auth: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back to JWT-only when Redis throws (graceful degradation)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      identity: true,
      tenant: false,
    });
    sessionService.identitySessionExistsPure.mockRejectedValue(
      new Error('ECONNREFUSED'),
    );

    (passport.authenticate as jest.Mock).mockImplementation(
      (_s: string, _o: unknown, cb: (e: Error | null, u?: unknown) => void) => {
        return () =>
          cb(null, {
            userId: 'u1',
            sessionId: 'iid',
          });
      },
    );

    const ok = await guard.canActivate(createContext({ auth: {} }));
    expect(ok).toBe(true);
  });

  it('throws when sessionId is missing on authenticated user (strict session)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      identity: true,
      tenant: false,
    });
    (passport.authenticate as jest.Mock).mockImplementation(
      (_s: string, _o: unknown, cb: (e: Error | null, u?: unknown) => void) => {
        return () =>
          cb(null, {
            userId: 'u1',
            sessionId: '',
          });
      },
    );

    await expect(
      guard.canActivate(createContext({ auth: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
