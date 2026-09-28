import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { checkWorkerHealth, type WorkerHealth } from '@lib/queue';
import { DocumentGenerationProcessor } from './processors/document-generation.processor';

@Controller()
export class WorkerGenerationController {
  constructor(private readonly processor: DocumentGenerationProcessor) {}

  /** 200 while the BullMQ worker runs and Redis answers; 503 otherwise (the task is replaced). */
  @Get('health')
  async health(): Promise<WorkerHealth> {
    const health = await checkWorkerHealth(this.processor);
    if (health.status !== 'ok') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
