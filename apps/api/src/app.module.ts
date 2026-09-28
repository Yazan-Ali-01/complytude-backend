import { AuditModule } from '@lib/audit';
import { PdfModule } from '@lib/pdf';
import { ContextModule, TracingInterceptor } from '@lib/context';
import { DatabaseModule } from '@lib/database';
import { LoggerModule } from '@lib/logger';
import { QUEUE_NAMES, QueueModule } from '@lib/queue';
import { RedisModule } from '@lib/redis';
import { Module, RequestMethod } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { configModuleOptions } from 'src/config/config-module.options';
import { AuthModule } from 'src/modules/auth/auth.module';
import { HealthModule } from 'src/modules/health/health.module';
import { UsersModule } from 'src/modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
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

// Dev-only demo routes. Opt-in, so a deploy that forgets NODE_ENV (which defaults to
// 'development') still doesn't mount them; env.schema.ts rejects the flag in production.
const mockRoutesEnabled = (env: NodeJS.ProcessEnv): boolean =>
  env.NODE_ENV !== 'production' &&
  env.ENABLE_MOCK_ROUTES?.toLowerCase() === 'true';

@Module({
  imports: [
    ConfigModule.forRoot(configModuleOptions),
    ContextModule.forRoot({ enableHttpTracing: true }),
    LoggerModule.forRoot({
      serviceName: 'gateway',
      excludeRoutes: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/(.*)', method: RequestMethod.ALL },
      ],
    }),
    RedisModule.forRoot(),
    RateLimitModule,
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
    ConditionalModule.registerWhen(MockModule, mockRoutesEnabled),
    ConditionalModule.registerWhen(RagMockModule, mockRoutesEnabled),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // After authentication, so per-tenant and per-user limits know who is calling
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
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
