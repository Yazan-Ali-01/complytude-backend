import { ConfigService } from '@nestjs/config';

export interface EmailConfig {
  awsRegion: string;
  fromEmail: string;
  fromName: string;
  supportEmail: string;
  frontendUrl: string;
  /** SES configuration set named on every send (event tracking, reputation); empty = none */
  configurationSet?: string;
}

export const emailConfig = (configService: ConfigService): EmailConfig => ({
  awsRegion: configService.get<string>('AWS_REGION', 'eu-central-1'),
  fromEmail: configService.get<string>('FROM_EMAIL')!,
  fromName: configService.get<string>('FROM_NAME', 'Complytude Billing'),
  supportEmail: configService.get<string>('SUPPORT_EMAIL')!,
  frontendUrl: configService.getOrThrow<string>('FRONTEND_URL'),
  configurationSet:
    configService.get<string>('SES_CONFIGURATION_SET') || undefined,
});
