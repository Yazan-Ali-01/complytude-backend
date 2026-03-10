import { Controller, Get } from '@nestjs/common';

@Controller()
export class WorkerAiController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
