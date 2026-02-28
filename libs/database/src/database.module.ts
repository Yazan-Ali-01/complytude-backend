import { DynamicModule, Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

@Global()
@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_POOL,
          useFactory: (configService: ConfigService) => {
            const host = configService.get<string>('database.host');
            const port = configService.get<number>('database.port');
            const database = configService.get<string>('database.name');
            const user = configService.get<string>('database.user');
            const password = configService.get<string>('database.password');

            if (!host || !database || !user) {
              throw new Error(
                'Database configuration not found. Make sure databaseConfig is loaded in ConfigModule.',
              );
            }

            DatabaseModule.logger.log(
              `Creating database pool: ${host}:${port}/${database}`,
            );

            return new Pool({
              host,
              port,
              database,
              user,
              password,
              max: configService.get<number>('database.maxConnections') ?? 20,
              idleTimeoutMillis:
                configService.get<number>('database.idleTimeoutMillis') ??
                30000,
              connectionTimeoutMillis:
                configService.get<number>('database.connectionTimeoutMillis') ??
                2000,
            });
          },
          inject: [ConfigService],
        },
        DatabaseService,
      ],
      exports: [DatabaseService, DATABASE_POOL],
    };
  }
}
