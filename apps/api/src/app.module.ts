import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@complytude/shared';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { FeaturesGuard, PermissionsGuard, TenantInterceptor } from '@complytude/shared';
import { I18nModule } from './i18n/i18n.module';
import databaseConfig from './config/database.config';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import storageConfig from './config/storage.config';
import { validationSchema } from './config/env.schema';
import { UsageResetJob } from './jobs/usage-reset.job';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, jwtConfig, storageConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ScheduleModule.forRoot(),
    I18nModule,
    DatabaseModule,
    HealthModule,
    TenantModule,
    AuthModule,
    UsersModule,
    StorageModule,
    TemplatesModule,
    CategoriesModule,
    AuthoritiesModule,
    RulesetsModule,
    DocumentsModule,
    RbacModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeaturesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    UsageResetJob,
  ],
})
export class AppModule {}
