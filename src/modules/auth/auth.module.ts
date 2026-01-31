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
import { AuthService } from './auth.service';
import {
  JWT_ACCESS_STRATEGY,
  JwtAccessStrategy,
} from './strategies/jwt-access.strategy';
import { JwtIdentityStrategy } from './strategies/jwt-identity.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: JWT_ACCESS_STRATEGY }),
    JwtModule.register({}), // Configuration done in strategies
    TenantModule,
    InvitationsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtIdentityStrategy,
    UserRepository,
    RefreshTokenRepository,
    EmailVerificationRepository,
    UserTenantRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
