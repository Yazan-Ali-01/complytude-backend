import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from './auth.service';

// uuid@13 is ESM-only; the unit project doesn't transform it
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('bcrypt', () => ({
  hash: jest.fn(() => Promise.resolve('$2b$12$dummy')),
  compare: jest.fn(() => Promise.resolve(false)),
}));

/**
 * What an attacker can time: login does the same bcrypt work whether or not the account exists
 * or has a password, and forgot-password answers before looking the account up.
 */
describe('AuthService: no account enumeration by timing', () => {
  const config = {
    get: (key: string) => (key === 'AUTH_ECHO_TOKENS' ? false : undefined),
  } as unknown as ConfigService;
  const i18n = { t: (key: string) => key } as unknown as I18nService;
  const userRepository = { findOne: jest.fn(), createPasswordReset: jest.fn() };
  const loginLockout = {
    lockedForSeconds: jest.fn().mockResolvedValue(0),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
  };

  function authService(): AuthService {
    return new AuthService(
      {} as never, // jwtService
      config,
      {} as never, // tenantService
      {} as never, // emailVerificationRepository
      userRepository as never,
      {} as never, // userTenantRepository
      {} as never, // databaseService
      {} as never, // invitationsService
      {
        sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      } as never,
      i18n,
      {} as never, // sessionService
      {} as never, // sessionInvalidationService
      {} as never, // geoLocationService
      {} as never, // redis
      loginLockout as never,
      { assertNotBreached: jest.fn() } as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['an unknown email', null],
    [
      'an account that signs in with Google only',
      { id: 'u1', password_hash: null, auth_provider: 'google' },
    ],
    [
      'a wrong password',
      { id: 'u1', password_hash: '$2b$12$real', auth_provider: 'email' },
    ],
  ])(
    'login with %s runs bcrypt once and answers INVALID_CREDENTIALS',
    async (_case, user) => {
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        authService().validateUser('someone@test.com', 'Password123!'),
      ).rejects.toThrow(
        new UnauthorizedException('auth.errors.INVALID_CREDENTIALS'),
      );

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      expect(loginLockout.recordFailure).toHaveBeenCalledWith(
        'someone@test.com',
      );
    },
  );

  it('forgot-password answers before the account is even looked up', async () => {
    let finishLookup: (user: null) => void = () => undefined;
    userRepository.findOne.mockReturnValue(
      new Promise((resolve) => {
        finishLookup = resolve;
      }),
    );

    const response = await authService().forgotPassword({
      email: 'someone@test.com',
    });

    expect(response).toEqual({
      message: 'auth.messages.PASSWORD_RESET_EMAIL_SENT',
    });
    finishLookup(null);
  });
});
