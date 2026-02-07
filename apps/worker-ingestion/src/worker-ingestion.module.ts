import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from '@complytude/shared/logger/logger.module';
import { validationSchema } from './config/env.schema';
import loggerConfig from './config/logger.config';
import workerIngestionConfig from './config/worker-ingestion.config';
import { WorkerIngestionController } from './worker-ingestion.controller';
import { WorkerIngestionService } from './worker-ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerIngestionConfig, loggerConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ingestion/.env'],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: configService.get<string>(
          'logger.serviceName',
          'worker-ingestion',
        ),
        logLevel: configService.get<string>('logger.level', 'info'),
        prettyPrint: configService.get<boolean>('logger.prettyPrint', false),
        autoLogging: configService.get<boolean>('logger.autoLogging', true),
      }),
    }),
  ],
  controllers: [WorkerIngestionController],
  providers: [WorkerIngestionService],
})
export class WorkerIngestionModule {}
