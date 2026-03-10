import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import { Module } from '@nestjs/common';
import { AnalysisJobsController } from './analysis-jobs.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController, AnalysisJobsController],
  providers: [DocumentsService, DocumentRepository, AnalysisJobRepository],
  exports: [DocumentsService],
})
export class DocumentsModule {}
