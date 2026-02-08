import { Test, TestingModule } from '@nestjs/testing';
import { WorkerIngestionController } from './worker-ingestion.controller';
import { WorkerIngestionService } from './worker-ingestion.service';

describe('WorkerIngestionController', () => {
  let workerIngestionController: WorkerIngestionController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [WorkerIngestionController],
      providers: [WorkerIngestionService],
    }).compile();

    workerIngestionController = app.get<WorkerIngestionController>(
      WorkerIngestionController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(workerIngestionController.getHello()).toBe('Hello World!');
    });
  });
});
