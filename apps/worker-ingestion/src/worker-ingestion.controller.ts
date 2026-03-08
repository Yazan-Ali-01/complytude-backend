import { Controller, Get } from '@nestjs/common';

@Controller()
export class WorkerIngestionController {
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
