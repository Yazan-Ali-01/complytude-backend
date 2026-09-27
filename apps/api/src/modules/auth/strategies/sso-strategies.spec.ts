import { ConfigService } from '@nestjs/config';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import { GoogleSsoStrategy } from './google-sso.strategy';
import { MicrosoftSsoStrategy } from './microsoft-sso.strategy';

// SSO disabled: the strategies are built with placeholder credentials and never call out.
const disabledConfig = {
  get: () => undefined,
} as unknown as ConfigService;

describe('GoogleSsoStrategy.validate', () => {
  const strategy = new GoogleSsoStrategy(disabledConfig);

  const profile = (overrides: Partial<GoogleProfile>): GoogleProfile =>
    ({
      id: 'google-subject',
      emails: [{ value: ' Person@Example.com ', verified: true }],
      name: { givenName: 'Per', familyName: 'Son' },
      _json: { email_verified: true },
      ...overrides,
    }) as unknown as GoogleProfile;

  it('maps a verified Google email', () => {
    expect(strategy.validate('at', 'rt', profile({}))).toEqual({
      provider: 'google',
      providerSubjectId: 'google-subject',
      email: 'person@example.com',
      emailVerified: true,
      firstName: 'Per',
      lastName: 'Son',
    });
  });

  it.each([
    [
      'both claims false',
      {
        emails: [{ value: 'p@example.com', verified: false }],
        _json: { email_verified: false },
      },
    ],
    [
      'claims missing',
      {
        emails: [{ value: 'p@example.com' }],
        _json: {},
      },
    ],
    [
      'claims set to a non-true string',
      {
        emails: [{ value: 'p@example.com', verified: 'false' }],
        _json: { email_verified: 'yes' },
      },
    ],
  ])('marks the email unverified when %s', (_label, overrides) => {
    expect(
      strategy.validate(
        'at',
        'rt',
        profile(overrides as unknown as Partial<GoogleProfile>),
      ).emailVerified,
    ).toBe(false);
  });

  it.each([
    ['the profile email claim', { verified: true }, {}],
    ['the ID token claim', { verified: undefined }, { email_verified: true }],
    [
      'the legacy string claim',
      { verified: 'true' },
      { email_verified: undefined },
    ],
  ])('marks the email verified from %s', (_label, emailClaim, jsonClaims) => {
    expect(
      strategy.validate(
        'at',
        'rt',
        profile({
          emails: [{ value: 'p@example.com', ...emailClaim }],
          _json: jsonClaims,
        } as unknown as Partial<GoogleProfile>),
      ).emailVerified,
    ).toBe(true);
  });
});

describe('MicrosoftSsoStrategy.validate', () => {
  const strategy = new MicrosoftSsoStrategy(disabledConfig);

  it('never marks the email verified, whatever Graph returns', () => {
    expect(
      strategy.validate('at', 'rt', {
        id: 'ms-subject',
        emails: [{ value: 'Victim@Customer.com' }],
        name: { givenName: 'Vic', familyName: 'Tim' },
        _json: { mail: 'Victim@Customer.com' },
      }),
    ).toEqual({
      provider: 'microsoft',
      providerSubjectId: 'ms-subject',
      email: 'victim@customer.com',
      emailVerified: false,
      firstName: 'Vic',
      lastName: 'Tim',
    });
  });

  it('falls back to userPrincipalName, still unverified', () => {
    const result = strategy.validate('at', 'rt', {
      id: 'ms-subject',
      _json: { userPrincipalName: 'upn@tenant.onmicrosoft.com' },
    });
    expect(result.email).toBe('upn@tenant.onmicrosoft.com');
    expect(result.emailVerified).toBe(false);
  });
});
