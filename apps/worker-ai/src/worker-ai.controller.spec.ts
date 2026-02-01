import { Test, TestingModule } from '@nestjs/testing';
import { WorkerAiController } from './worker-ai.controller';
import { WorkerAiService } from './worker-ai.service';

describe('WorkerAiController', () => {
  let workerAiController: WorkerAiController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [WorkerAiController],
      providers: [WorkerAiService],
    }).compile();

    workerAiController = app.get<WorkerAiController>(WorkerAiController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(workerAiController.getHello()).toBe('Hello World!');
    });
  });
});
