import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  DatabaseModule,
  databaseConfig,
  appConfig,
} from '@complytude/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig],
    }),
    DatabaseModule,
  ],
  providers: [],
})
export class WorkerIngestionModule {}