import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { DatabaseModule } from '../../database/database.module';
import { EmailVerificationRepository } from '../../repositories/users/email-verification.repository';
import { RefreshTokenRepository } from '../../repositories/users/refresh-token.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration done in strategies
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    EmailVerificationRepository,
    RefreshTokenRepository,
    UserRepository,
    UserTenantRepository,
  ],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
