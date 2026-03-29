import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AnalysisJobsController } from './analysis-jobs.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { VariableValidationService } from './services/variable-validation.service';

@Module({
  imports: [StorageModule],
  controllers: [DocumentsController, AnalysisJobsController],
  providers: [
    DocumentsService,
    DocumentRepository,
    AnalysisJobRepository,
    VariableValidationService,
  ],
  exports: [DocumentsService, VariableValidationService],
})
export class DocumentsModule {}
