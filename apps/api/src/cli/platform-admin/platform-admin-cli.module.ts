import { AuditModule } from '@lib/audit';
import { DatabaseModule } from '@lib/database';
import { RedisModule } from '@lib/redis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configModuleOptions } from 'src/config/config-module.options';
import { I18nModule } from 'src/i18n/i18n.module';
import { SessionInvalidationService } from 'src/modules/auth/services/session-invalidation.service';
import { SessionService } from 'src/modules/auth/services/session.service';
import { EmailModule } from 'src/modules/email/email.module';
import { UserRepository } from 'src/repositories/users/user.repository';
import { PlatformAdminBootstrapService } from './platform-admin-bootstrap.service';

/**
 * Just what granting a platform role needs. Deliberately not AppModule: that registers BullMQ
 * consumers, which a one-off command must not start.
 */
@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    DatabaseModule.forRoot(),
    RedisModule.forRoot(),
    AuditModule.forRoot(),
    I18nModule,
    EmailModule,
  ],
  providers: [
    UserRepository,
    SessionService,
    SessionInvalidationService,
    PlatformAdminBootstrapService,
  ],
})
export class PlatformAdminCliModule {}
