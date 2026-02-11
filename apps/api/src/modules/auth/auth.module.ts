import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailVerificationRepository } from 'src/repositories/users/email-verification.repository';
// RefreshTokenRepository kept as fallback during Strangler Fig migration
// Circuit breaker switches between Redis (primary) and PostgreSQL (fallback)
import { RefreshTokenRepository } from 'src/repositories/users/refresh-token.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantModule } from '../tenants/tenant.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminSessionsController } from './controllers/admin-sessions.controller';
import { SessionsController } from './controllers/sessions.controller';
import { JwtIdentityAccessStrategy } from './strategies/jwt-identity-access.strategy';
import { JwtIdentityRefreshStrategy } from './strategies/jwt-identity-refresh.strategy';
import {
  JWT_TENANT_ACCESS_STRATEGY,
  JwtTenantAccessStrategy,
} from './strategies/jwt-tenant-access.strategy';
import { JwtTenantRefreshStrategy } from './strategies/jwt-tenant-refresh.strategy';

/**
 * AuthModule - Authentication and authorization with Strangler Fig pattern
 *
 * Note: Session services (SessionService, SessionInvalidationService, SessionCircuitBreakerService,
 * GeoLocationService, UserAgentParserService) are provided by SessionModule which is @Global().
 * No need to import or provide them here.
 *
 * Strangler Fig Migration:
 * - RefreshTokenRepository kept as fallback during migration
 * - Circuit breaker switches between Redis (primary) and PostgreSQL (fallback)
 * - After successful migration, RefreshTokenRepository will be removed
 */
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: JWT_TENANT_ACCESS_STRATEGY }),
    JwtModule.register({}), // Configuration done in strategies
    TenantModule,
    InvitationsModule,
    AuditModule, // Required for AdminSessionsController Break Glass logging
    // Note: RedisModule and SessionModule are global - don't import here
  ],
  controllers: [
    AuthController,
    SessionsController,
    AdminSessionsController, // System admin session management
  ],
  providers: [
    AuthService,
    JwtTenantAccessStrategy,
    JwtTenantRefreshStrategy,
    JwtIdentityAccessStrategy,
    JwtIdentityRefreshStrategy,
    UserRepository,
    RefreshTokenRepository, // Kept as fallback during Strangler Fig migration
    EmailVerificationRepository,
    UserTenantRepository,
    // Note: SessionCircuitBreakerService, GeoLocationService, UserAgentParserService
    // are provided globally by SessionModule - don't duplicate here
  ],
  exports: [AuthService],
})
export class AuthModule {}
