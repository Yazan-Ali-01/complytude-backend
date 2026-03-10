import { databaseConfig, DatabaseModule } from '@lib/database';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig, RedisModule } from '@lib/redis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import appConfig from 'src/config/app.config';
import { validationSchema } from 'src/config/env.schema';
import jwtConfig from 'src/config/jwt.config';
import storageConfig from 'src/config/storage.config';
import { AuthModule } from 'src/modules/auth/auth.module';
import { HealthModule } from 'src/modules/health/health.module';
import { UsersModule } from 'src/modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { I18nModule } from './i18n/i18n.module';
import { AuditModule } from './modules/audit/audit.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { MockModule } from './modules/mock/mock.module';
import { RagMockModule } from './modules/rag-mock/rag-mock.module';
import { PlatformRbacModule } from './modules/platform-rbac/platform-rbac.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { StorageModule } from './modules/storage/storage.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { TenantRbacModule } from './modules/tenant-rbac/tenant-rbac.module';
import { TenantModule } from './modules/tenants/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env'],
      load: [databaseConfig, appConfig, jwtConfig, storageConfig, redisConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    RedisModule.forRoot(),
    QueueModule.forRoot([
      QUEUE_NAMES.AI_PROCESSING,
      QUEUE_NAMES.DATA_INGESTION,
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
    ]),
    I18nModule,
    DatabaseModule.forRoot(),
    HealthModule,
    EntitlementsModule,
    SubscriptionsModule,
    TenantModule,
    AuthModule,
    UsersModule,
    StorageModule,
    TemplatesModule,
    CategoriesModule,
    AuthoritiesModule,
    RulesetsModule,
    DocumentsModule,
    TenantRbacModule,
    PlatformRbacModule,
    AuditModule,
    MockModule,
    RagMockModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
