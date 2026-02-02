import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import appConfig from 'src/config/app.config';
import databaseConfig from 'src/config/database.config';
import { validationSchema } from 'src/config/env.schema';
import jwtConfig from 'src/config/jwt.config';
import storageConfig from 'src/config/storage.config';
import { DatabaseModule } from 'src/database/database.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { HealthModule } from 'src/modules/health/health.module';
import { UsersModule } from 'src/modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { I18nModule } from './i18n/i18n.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthoritiesModule } from './modules/authorities/authorities.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { RulesetsModule } from './modules/rulesets/rulesets.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { TenantModule } from './modules/tenants/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env'],
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
    CategoriesModule,
    AuthoritiesModule,
    RulesetsModule,
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: TenantInterceptor,
    // },
  ],
})
export class AppModule {}
