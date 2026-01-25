import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailVerificationRepository } from 'src/repositories/users/email-verification.repository';
import { RefreshTokenRepository } from 'src/repositories/users/refresh-token.repository';
import { UserTenantRepository } from 'src/repositories/users/user-tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { DatabaseModule } from '../../database/database.module';
import { TenantModule } from '../tenants/tenant.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtTempAuthStrategy } from './strategies/jwt-temp-auth.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration done in strategies
    TenantModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtTempAuthStrategy,
    UserRepository,
    RefreshTokenRepository,
    EmailVerificationRepository,
    UserTenantRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
