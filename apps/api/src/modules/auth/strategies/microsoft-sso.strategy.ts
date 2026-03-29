import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import { SsoOAuthProfile } from './sso-payload.interface';

export const MICROSOFT_SSO_STRATEGY_NAME = 'microsoft';

/** Microsoft Graph user profile shape from passport-microsoft */
type MicrosoftGraphProfile = {
  id: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails?: { value: string }[];
  _json?: { mail?: string; userPrincipalName?: string };
};

@Injectable()
export class MicrosoftSsoStrategy extends PassportStrategy(
  Strategy,
  MICROSOFT_SSO_STRATEGY_NAME,
) {
  constructor(private readonly configService: ConfigService) {
    const enabled = configService.get<boolean>('sso.microsoft.enabled');
    super({
      clientID: enabled
        ? configService.get<string>('sso.microsoft.clientId')!
        : 'disabled',
      clientSecret: enabled
        ? configService.get<string>('sso.microsoft.clientSecret')!
        : 'disabled',
      callbackURL: enabled
        ? configService.get<string>('sso.microsoft.callbackUrl')!
        : 'http://localhost/disabled',
      scope: ['user.read'],
      tenant: enabled
        ? configService.get<string>('sso.microsoft.tenant')!
        : 'common',
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: MicrosoftGraphProfile,
  ): SsoOAuthProfile {
    const rawEmail =
      profile.emails?.[0]?.value ??
      profile._json?.mail ??
      profile._json?.userPrincipalName ??
      '';
    const email = rawEmail.trim().toLowerCase();
    const firstName = profile.name?.givenName ?? null;
    const lastName = profile.name?.familyName ?? null;

    return {
      provider: 'microsoft',
      providerSubjectId: profile.id,
      email,
      firstName,
      lastName,
    };
  }
}
