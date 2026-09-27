import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { SsoOAuthProfile } from './sso-payload.interface';

export const GOOGLE_SSO_STRATEGY_NAME = 'google';

/** Google sends `email_verified` as a boolean; older endpoints used the string "true". */
function isTrueClaim(value: unknown): boolean {
  return value === true || value === 'true';
}

@Injectable()
export class GoogleSsoStrategy extends PassportStrategy(
  Strategy,
  GOOGLE_SSO_STRATEGY_NAME,
) {
  constructor(private readonly configService: ConfigService) {
    const enabled = configService.get<boolean>('sso.google.enabled');
    super({
      clientID: enabled
        ? configService.get<string>('sso.google.clientId')!
        : 'disabled',
      clientSecret: enabled
        ? configService.get<string>('sso.google.clientSecret')!
        : 'disabled',
      callbackURL: enabled
        ? configService.get<string>('sso.google.callbackUrl')!
        : 'http://localhost/disabled',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): SsoOAuthProfile {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase() ?? '';
    const firstName = profile.name?.givenName ?? null;
    const lastName = profile.name?.familyName ?? null;

    return {
      provider: 'google',
      providerSubjectId: profile.id,
      email,
      emailVerified:
        isTrueClaim(profile.emails?.[0]?.verified) ||
        isTrueClaim(profile._json?.email_verified),
      firstName,
      lastName,
    };
  }
}
