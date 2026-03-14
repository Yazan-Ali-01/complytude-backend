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
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

export interface DatabaseModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => PoolConfig | Promise<PoolConfig>;
  inject?: InjectionToken[] | OptionalFactoryDependency[];
}

@Global()
@Module({})
export class DatabaseModule {
  private static readonly logger = new Logger(DatabaseModule.name);

  static forRoot(): DynamicModule {
    return DatabaseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): PoolConfig => {
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

        const sslEnabled = configService.get<boolean>('database.sslEnabled');
        const sslRejectUnauthorized =
          configService.get<boolean>('database.sslRejectUnauthorized') ?? true;
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
            configService.get<number>('database.connectionTimeoutMillis') ??
            2000,
          ...(sslEnabled && {
            ssl: { rejectUnauthorized: sslRejectUnauthorized },
          }),
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
        DatabaseService,
      ],
      exports: [DatabaseService, DATABASE_POOL],
    };
  }
}
