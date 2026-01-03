import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { I18nModule } from './i18n/i18n.module';
import databaseConfig from './config/database.config';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import storageConfig from './config/storage.config';
import { validationSchema } from './config/validation.schema';

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
    I18nModule,
    DatabaseModule,
    HealthModule,
    TenantModule,
    AuthModule,
    UsersModule,
    StorageModule,
    TemplatesModule,
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
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
