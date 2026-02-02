import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkerIngestionService {
  getHello(): string {
    return 'Hello World!';
  }
}
