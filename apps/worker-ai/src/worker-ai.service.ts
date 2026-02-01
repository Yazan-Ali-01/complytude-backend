import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkerAiService {
  getHello(): string {
    return 'Hello World!';
  }
}
