import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from '@complytude/shared/logger/logger.module';
import { validationSchema } from './config/env.schema';
import loggerConfig from './config/logger.config';
import workerAiConfig from './config/worker-ai.config';
import { WorkerAiController } from './worker-ai.controller';
import { WorkerAiService } from './worker-ai.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [workerAiConfig, loggerConfig],
      validationSchema: validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['apps/worker-ai/.env'],
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        serviceName: configService.get<string>(
          'logger.serviceName',
          'worker-ai',
        ),
        logLevel: configService.get<string>('logger.level', 'info'),
        prettyPrint: configService.get<boolean>('logger.prettyPrint', false),
        autoLogging: configService.get<boolean>('logger.autoLogging', true),
      }),
    }),
  ],
  controllers: [WorkerAiController],
  providers: [WorkerAiService],
})
export class WorkerAiModule {}
