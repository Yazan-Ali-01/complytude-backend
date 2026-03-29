import { Controller, Get } from '@nestjs/common';

@Controller()
export class WorkerGenerationController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
