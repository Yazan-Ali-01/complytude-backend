import { RedisModule } from '@lib/redis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailVerificationRepository } from 'src/repositories/users/email-verification.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { EmailModule } from '../email/email.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantModule } from '../tenants/tenant.module';
import { AdminSessionsController } from './admin-sessions.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleSsoAuthGuard } from './guards/google-sso-auth.guard';
import { MicrosoftSsoAuthGuard } from './guards/microsoft-sso-auth.guard';
import { GeoLocationService } from './services/geo-location.service';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';
import { GoogleSsoStrategy } from './strategies/google-sso.strategy';
import { JwtIdentityAccessStrategy } from './strategies/jwt-identity-access.strategy';
import { JwtIdentityRefreshStrategy } from './strategies/jwt-identity-refresh.strategy';
import {
  JWT_TENANT_ACCESS_STRATEGY,
  JwtTenantAccessStrategy,
} from './strategies/jwt-tenant-access.strategy';
import { JwtTenantRefreshStrategy } from './strategies/jwt-tenant-refresh.strategy';
import { MicrosoftSsoStrategy } from './strategies/microsoft-sso.strategy';

function isGoogleSsoEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_CALLBACK_URL?.trim(),
  );
}

function isMicrosoftSsoEnabled(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID?.trim() &&
      process.env.MICROSOFT_CLIENT_SECRET?.trim() &&
      process.env.MICROSOFT_CALLBACK_URL?.trim(),
  );
}

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: JWT_TENANT_ACCESS_STRATEGY }),
    JwtModule.register({}), // Configuration done in strategies
    EmailModule,
    TenantModule,
    InvitationsModule,
  ],
  controllers: [AuthController, AdminSessionsController],
  providers: [
    AuthService,
    GeoLocationService,
    SessionService,
    SessionInvalidationService,
    JwtTenantAccessStrategy,
    JwtTenantRefreshStrategy,
    JwtIdentityAccessStrategy,
    JwtIdentityRefreshStrategy,
    GoogleSsoAuthGuard,
    MicrosoftSsoAuthGuard,
    ...(isGoogleSsoEnabled() ? [GoogleSsoStrategy] : []),
    ...(isMicrosoftSsoEnabled() ? [MicrosoftSsoStrategy] : []),
    UserRepository,
    EmailVerificationRepository,
    UserTenantRepository,
  ],
  exports: [AuthService, SessionService, SessionInvalidationService],
})
export class AuthModule {}
