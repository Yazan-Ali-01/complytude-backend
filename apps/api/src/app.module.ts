import { AuditModule } from '@lib/audit';
import { PdfModule } from '@lib/pdf';
import { ContextModule, TracingInterceptor } from '@lib/context';
import { databaseConfig, DatabaseModule } from '@lib/database';
import { LoggerModule } from '@lib/logger';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { redisConfig, RedisModule } from '@lib/redis';
import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import appConfig from 'src/config/app.config';
import { validationSchema } from 'src/config/env.schema';
import geoConfig from 'src/config/geo.config';
import jwtConfig from 'src/config/jwt.config';
import sessionConfig from 'src/config/session.config';
import ssoConfig from 'src/config/sso.config';
import storageConfig from 'src/config/storage.config';
import stripeConfig from 'src/config/stripe.config';
import { AuthModule } from 'src/modules/auth/auth.module';
import { HealthModule } from 'src/modules/health/health.module';
import { UsersModule } from 'src/modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { I18nModule } from './i18n/i18n.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { BillingModule } from './modules/billing/billing.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { MockModule } from './modules/mock/mock.module';
import { PlatformRbacModule } from './modules/platform-rbac/platform-rbac.module';
import { RagMockModule } from './modules/rag-mock/rag-mock.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { StorageModule } from './modules/storage/storage.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { TenantProcessingModule } from './modules/tenant-processing/tenant-processing.module';
import { TenantRbacModule } from './modules/tenant-rbac/tenant-rbac.module';
import { TenantModule } from './modules/tenants/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env'],
      load: [
        databaseConfig,
        appConfig,
        jwtConfig,
        geoConfig,
        sessionConfig,
        storageConfig,
        stripeConfig,
        ssoConfig,
        redisConfig,
      ],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ContextModule.forRoot({ enableHttpTracing: true }),
    LoggerModule.forRoot({
      serviceName: 'gateway',
      excludeRoutes: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/(.*)', method: RequestMethod.ALL },
      ],
    }),
    RedisModule.forRoot(),
    QueueModule.forRoot([
      QUEUE_NAMES.AI_PROCESSING,
      QUEUE_NAMES.BILLING_PROCESSING,
      QUEUE_NAMES.DATA_INGESTION,
      QUEUE_NAMES.ENTITLEMENT_PROCESSING,
      QUEUE_NAMES.TENANT_PROCESSING,
      QUEUE_NAMES.DOCUMENT_GENERATION,
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
    StripeModule,
    BillingModule,
    TenantProcessingModule,
    TenantRbacModule,
    PlatformRbacModule,
    AuditModule.forRoot(),
    PdfModule,
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
      useClass: TracingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
