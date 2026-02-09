import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailVerificationRepository } from 'src/repositories/users/email-verification.repository';
import { RefreshTokenRepository } from 'src/repositories/users/refresh-token.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { DatabaseModule } from '../../database/database.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantModule } from '../tenants/tenant.module';
import { AuthController } from './auth.controller';
import { SessionsController } from './controllers/sessions.controller';
import { AuthService } from './auth.service';
import { JwtIdentityAccessStrategy } from './strategies/jwt-identity-access.strategy';
import { JwtIdentityRefreshStrategy } from './strategies/jwt-identity-refresh.strategy';
import {
  JWT_TENANT_ACCESS_STRATEGY,
  JwtTenantAccessStrategy,
} from './strategies/jwt-tenant-access.strategy';
import { JwtTenantRefreshStrategy } from './strategies/jwt-tenant-refresh.strategy';

/**
 * AuthModule - Authentication and authorization
 *
 * Note: Session services (SessionService, SessionInvalidationService, etc.)
 * are provided by SessionModule which is @Global(). No need to import or provide them here.
 */
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: JWT_TENANT_ACCESS_STRATEGY }),
    JwtModule.register({}), // Configuration done in strategies
    TenantModule,
    InvitationsModule,
    // Note: RedisModule and SessionModule are global - don't import here
  ],
  controllers: [AuthController, SessionsController],
  providers: [
    AuthService,
    JwtTenantAccessStrategy,
    JwtTenantRefreshStrategy,
    JwtIdentityAccessStrategy,
    JwtIdentityRefreshStrategy,
    UserRepository,
    RefreshTokenRepository,
    EmailVerificationRepository,
    UserTenantRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
