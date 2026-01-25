import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@complytude/shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    // TODO: Add BullMQ module
    // TODO: Add processor modules
  ],
})
export class WorkerIngestionModule {}
