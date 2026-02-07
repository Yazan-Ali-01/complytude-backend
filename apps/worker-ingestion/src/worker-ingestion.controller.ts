import { Controller, Get } from '@nestjs/common';
import { WorkerIngestionService } from './worker-ingestion.service';

@Controller()
export class WorkerIngestionController {
  constructor(
    private readonly workerIngestionService: WorkerIngestionService,
  ) {}

  @Get()
  getHello(): string {
    return this.workerIngestionService.getHello();
  }
}
