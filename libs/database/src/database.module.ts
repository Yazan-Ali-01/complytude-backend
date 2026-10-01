import {
  DynamicModule,
  Global,
  InjectionToken,
  Logger,
  Module,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolConfig } from 'pg';
import { DATABASE_PLATFORM_POOL, DATABASE_POOL } from './database.constants';
import { buildSslOptions } from './ssl-options';
import { DatabaseService } from './database.service';

export interface DatabaseModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => PoolConfig | Promise<PoolConfig>;
  /** The platform login's connection; null or absent when the process has none. */
  usePlatformFactory?: (
    ...args: unknown[]
  ) => PoolConfig | null | Promise<PoolConfig | null>;
  inject?: InjectionToken[] | OptionalFactoryDependency[];
}

@Global()
@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  static forRoot(): DynamicModule {
    const connection = (configService: ConfigService): PoolConfig => {
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

      const ssl = buildSslOptions({
        enabled: configService.get<boolean>('database.sslEnabled') ?? false,
        rejectUnauthorized:
          configService.get<boolean>('database.sslRejectUnauthorized') ?? true,
        caPath: configService.get<string>('database.sslCaPath'),
      });
      return {
        host,
        port,
        database,
        user,
        password,
        max: configService.get<number>('database.maxConnections') ?? 20,
        idleTimeoutMillis:
          configService.get<number>('database.idleTimeoutMillis') ?? 30000,
        connectionTimeoutMillis:
          configService.get<number>('database.connectionTimeoutMillis') ?? 2000,
        // A runaway query or a transaction left open (a hung external call inside it) is ended by
        // Postgres instead of holding a connection and its locks indefinitely
        statement_timeout:
          configService.get<number>('database.statementTimeoutMs') || 15000,
        idle_in_transaction_session_timeout:
          configService.get<number>('database.idleInTransactionTimeoutMs') ||
          30000,
        ...(ssl && { ssl }),
      };
    };

    return DatabaseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): PoolConfig =>
        connection(configService),
      usePlatformFactory: (configService: ConfigService): PoolConfig | null => {
        const user = configService.get<string>('database.platformUser');
        if (!user) return null;
        return {
          ...connection(configService),
          user,
          password: configService.get<string>('database.platformPassword'),
          max:
            configService.get<number>('database.platformMaxConnections') || 5,
        };
      },
    });
  }

  static forRootAsync(options: DatabaseModuleAsyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: DATABASE_POOL,
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);

            DatabaseModule.logger.log(
              `Creating database pool: ${config.host}:${config.port}/${config.database}`,
            );

            return new Pool(config);
          },
          inject: options.inject ?? [],
        },
        {
          provide: DATABASE_PLATFORM_POOL,
          useFactory: async (...args: unknown[]): Promise<Pool | null> => {
            const config = await options.usePlatformFactory?.(...args);
            if (!config) return null;

            DatabaseModule.logger.log(
              `Creating platform database pool: ${config.host}:${config.port}/${config.database}`,
            );

            return new Pool(config);
          },
          inject: options.inject ?? [],
        },
        DatabaseService,
      ],
      exports: [DatabaseService, DATABASE_POOL],
    };
  }
}
