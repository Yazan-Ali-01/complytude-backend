import { Controller, Get } from '@nestjs/common';
import { WorkerAiService } from './worker-ai.service';

@Controller()
export class WorkerAiController {
  constructor(private readonly workerAiService: WorkerAiService) {}

  @Get()
  getHello(): string {
    return this.workerAiService.getHello();
  }
}
