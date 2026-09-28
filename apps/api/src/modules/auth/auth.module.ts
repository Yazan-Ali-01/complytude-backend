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
import { SessionsModule } from './sessions.module';
import { AdminSessionsController } from './admin-sessions.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleSsoAuthGuard } from './guards/google-sso-auth.guard';
import { MicrosoftSsoAuthGuard } from './guards/microsoft-sso-auth.guard';
import { GeoLocationService } from './services/geo-location.service';
import { GoogleSsoStrategy } from './strategies/google-sso.strategy';
import { JwtIdentityAccessStrategy } from './strategies/jwt-identity-access.strategy';
import { JwtIdentityRefreshStrategy } from './strategies/jwt-identity-refresh.strategy';
import {
  JWT_TENANT_ACCESS_STRATEGY,
  JwtTenantAccessStrategy,
} from './strategies/jwt-tenant-access.strategy';
import { JwtTenantRefreshStrategy } from './strategies/jwt-tenant-refresh.strategy';
import { LoginLockoutService } from './services/login-lockout.service';
import { MicrosoftSsoStrategy } from './strategies/microsoft-sso.strategy';
import { SsoCallbackExceptionFilter } from './filters/sso-callback-exception.filter';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: JWT_TENANT_ACCESS_STRATEGY }),
    JwtModule.register({}), // Configuration done in strategies
    EmailModule,
    TenantModule,
    InvitationsModule,
    SessionsModule,
  ],
  controllers: [AuthController, AdminSessionsController],
  providers: [
    AuthService,
    GeoLocationService,
    LoginLockoutService,
    JwtTenantAccessStrategy,
    JwtTenantRefreshStrategy,
    JwtIdentityAccessStrategy,
    JwtIdentityRefreshStrategy,
    GoogleSsoAuthGuard,
    MicrosoftSsoAuthGuard,
    SsoCallbackExceptionFilter,
    GoogleSsoStrategy,
    MicrosoftSsoStrategy,
    UserRepository,
    EmailVerificationRepository,
    UserTenantRepository,
  ],
  exports: [AuthService, SessionsModule],
})
export class AuthModule {}
