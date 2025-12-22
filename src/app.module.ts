import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from 'src/database/database.module';
import { HealthModule } from 'src/modules/health/health.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UsersModule } from 'src/modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import databaseConfig from 'src/config/database.config';
import appConfig from 'src/config/app.config';
import jwtConfig from 'src/config/jwt.config';
import storageConfig from 'src/config/storage.config';
import { validationSchema } from 'src/config/env.schema';

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
