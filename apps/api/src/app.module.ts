import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import {
  DatabaseModule,
  I18nModule,
  databaseConfig,
  appConfig,
  jwtConfig,
  storageConfig,
  validationSchema,
} from '@complytude/shared';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

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
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}