import {
  ExecutionContext,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import passport from 'passport';
import {
  AUTH_OPTIONS_KEY,
  AUTH_REFRESH_OPTIONS_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/auth-options.decorator';
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
      | 'isTenantInactive'
    >
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    sessionService = {
      identitySessionExistsPure: jest.fn(),
      tenantSessionExistsPure: jest.fn(),
      touchIdentityActivity: jest.fn(),
      touchTenantActivity: jest.fn(),
      isTenantInactive: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<
      Pick<
        SessionService,
        | 'identitySessionExistsPure'
        | 'tenantSessionExistsPure'
        | 'touchIdentityActivity'
        | 'touchTenantActivity'
        | 'isTenantInactive'
      >
    >;

    configService = {
      get: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;

    guard = new JwtAuthGuard(
      reflector,
      sessionService as unknown as SessionService,
      configService as unknown as ConfigService,
    );
  });

  function setMetadata(byKey: Record<string, unknown>): void {
    reflector.getAllAndOverride.mockImplementation(
      (key: unknown) => byKey[key as string],
    );
  }

  describe('deny by default', () => {
    let loggerError: jest.SpyInstance;

    beforeEach(() => {
      (passport.authenticate as jest.Mock).mockClear();
      loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => loggerError.mockRestore());

    it('denies a route with no @AuthOptions, @AuthRefreshOptions or @Public()', async () => {
      setMetadata({});
      await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(loggerError).toHaveBeenCalled();
      expect((passport.authenticate as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('denies @AuthOptions that require no token', async () => {
      setMetadata({
        [AUTH_OPTIONS_KEY]: { tenant: false, identity: false },
      });
      await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('allows a @Public() route without authenticating', async () => {
      setMetadata({ [IS_PUBLIC_KEY]: true });
      await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
      expect((passport.authenticate as jest.Mock).mock.calls).toHaveLength(0);
      expect(sessionService.identitySessionExistsPure).not.toHaveBeenCalled();
    });

    it('lets an @AuthRefreshOptions route through to JwtAuthRefreshGuard', async () => {
      setMetadata({ [AUTH_REFRESH_OPTIONS_KEY]: { identity: true } });
      await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
      expect((passport.authenticate as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('lets @AuthOptions win over @Public()', async () => {
      setMetadata({
        [AUTH_OPTIONS_KEY]: { tenant: true, identity: false },
        [IS_PUBLIC_KEY]: true,
      });
      (passport.authenticate as jest.Mock).mockImplementation(
        (
          _s: string,
          _o: unknown,
          cb: (e: Error | null, u?: unknown) => void,
        ) => {
          return () => cb(null, undefined);
        },
      );
      await expect(
        guard.canActivate(createContext({ auth: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(
        (passport.authenticate as jest.Mock).mock.calls.length,
      ).toBeGreaterThan(0);
    });
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

  it('refuses the request (503) when Redis throws, never falling back to the JWT alone', async () => {
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

    await expect(
      guard.canActivate(createContext({ auth: {} })),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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
