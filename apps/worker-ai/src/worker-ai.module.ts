import { Module } from '@nestjs/common';
import { WorkerAiController } from './worker-ai.controller';
import { WorkerAiService } from './worker-ai.service';

@Module({
  imports: [],
  controllers: [WorkerAiController],
  providers: [WorkerAiService],
})
export class WorkerAiModule {}
