import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { LoggerModuleOptions } from './interfaces/logger-options.interface';
import { createPinoConfig } from './logger.config';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: LoggerModuleOptions): DynamicModule {
    return {
      module: LoggerModule,
      imports: [
        PinoLoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            return createPinoConfig(
              configService,
              options.serviceName,
              options.excludeRoutes,
            );
          },
        }),
      ],
    };
  }
}
