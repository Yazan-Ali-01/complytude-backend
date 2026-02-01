import { Module } from '@nestjs/common';
import { WorkerIngestionController } from './worker-ingestion.controller';
import { WorkerIngestionService } from './worker-ingestion.service';

@Module({
  imports: [],
  controllers: [WorkerIngestionController],
  providers: [WorkerIngestionService],
})
export class WorkerIngestionModule {}
