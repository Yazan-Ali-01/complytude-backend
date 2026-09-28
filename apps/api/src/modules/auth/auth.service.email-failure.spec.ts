import { SESClient } from '@aws-sdk/client-ses';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { I18nService } from 'nestjs-i18n';
import { EmailService } from '../email/email.service';
import { AuthService } from './auth.service';

// uuid@13 is ESM-only; the unit project doesn't transform it (the integration project maps it too)
jest.mock('uuid', () => ({
  v4: (): string => '00000000-0000-4000-8000-000000000000',
}));

/**
 * SES rejects the address (sandbox, suppression list, throttling). Signup and forgot-password must
 * still answer normally, and the rejection must never become an unhandled promise rejection, which
 * would terminate the API process on Node >= 15.
 */
describe('AuthService when SES rejects the email', () => {
  const sesRejection = new Error(
    'MessageRejected: Email address is not verified.',
  );
  const events: string[] = [];
  let sesSend: jest.SpyInstance;
  let loggedErrors: string[];
  let unhandled: jest.Mock;

  const config: Record<string, string> = {
    EMAIL_SKIP_SEND: 'false',
    FROM_EMAIL: 'noreply@example.com',
    SUPPORT_EMAIL: 'support@example.com',
    EMAIL_VERIFICATION_EXPIRES_IN: '1d',
    FRONTEND_URL: 'http://localhost:3001',
    'app.environment': 'test',
  };
  const configService = {
    get: (key: string, fallback?: unknown) => config[key] ?? fallback,
    getOrThrow: (key: string) => config[key],
  } as unknown as ConfigService;
  const i18n = {
    t: (key: string) => key,
  } as unknown as I18nService;

  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    createPasswordReset: jest.fn(),
  };
  const emailVerificationRepository = {
    createEmailVerification: jest.fn(),
  };
  const databaseService = {
    transaction: jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const result = await callback({});
        events.push('commit');
        return result;
      },
    ),
  };

  function buildAuthService(): AuthService {
    const emailService = new EmailService(configService, i18n);
    return new AuthService(
      {} as never, // jwtService
      configService,
      {} as never, // tenantService
      emailVerificationRepository as never,
      userRepository as never,
      {} as never, // userTenantRepository
      databaseService as never,
      {} as never, // invitationsService
      emailService,
      i18n,
      {} as never, // sessionService
      {} as never, // sessionInvalidationService
      {} as never, // geoLocationService
      {} as never, // redis
      {} as never, // loginLockout
    );
  }

  /** Lets the fire-and-forget send settle, and any unhandled rejection be reported. */
  const settle = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 20));

  beforeEach(() => {
    events.length = 0;
    loggedErrors = [];
    jest.clearAllMocks();
    // send() is overloaded (callback style returns void); type the spy as the promise form
    sesSend = jest
      .spyOn(
        SESClient.prototype as unknown as { send: () => Promise<unknown> },
        'send',
      )
      .mockImplementation(() => {
        events.push('ses.send');
        return Promise.reject(sesRejection);
      });
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        loggedErrors.push(String(message));
      });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    jest.restoreAllMocks();
  });

  it('signs the user up, logs the failed send without the token, and leaves no unhandled rejection', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockResolvedValue({ id: 'user-1' });
    emailVerificationRepository.createEmailVerification.mockResolvedValue({});

    const result = (await buildAuthService().signup({
      email: 'rejected@example.com',
      password: 'Test123!@#',
    })) as { message: string; verificationToken: string };
    await settle();

    expect(result.message).toBe('auth.messages.SIGNUP_SUCCESS');
    expect(sesSend).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    expect(loggedErrors).toContainEqual(
      expect.stringContaining('Verification email failed for user user-1'),
    );
    expect(
      loggedErrors.filter((line) => line.includes(result.verificationToken)),
    ).toEqual([]);
  });

  it('sends the verification email only after the signup transaction commits', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockResolvedValue({ id: 'user-1' });
    emailVerificationRepository.createEmailVerification.mockResolvedValue({});

    await buildAuthService().signup({
      email: 'rejected@example.com',
      password: 'Test123!@#',
    });
    await settle();

    expect(events).toEqual(['commit', 'ses.send']);
  });

  it('answers forgot-password normally and leaves no unhandled rejection', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'user-2' });
    userRepository.createPasswordReset.mockResolvedValue(undefined);

    const result = await buildAuthService().forgotPassword({
      email: 'rejected@example.com',
    });
    await settle();

    expect(result.message).toBe('auth.messages.PASSWORD_RESET_EMAIL_SENT');
    expect(sesSend).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
    expect(loggedErrors).toContainEqual(
      expect.stringContaining('Password reset email failed for user user-2'),
    );
  });
});
