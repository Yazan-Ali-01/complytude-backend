import { Module } from '@nestjs/common';
import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import { GenerationJobRepository } from 'src/repositories/generation-jobs/generation-job.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import { StorageModule } from '../storage/storage.module';
import { TemplatesModule } from '../templates/templates.module';
import { AnalysisJobsController } from './analysis-jobs.controller';
import { DocumentsController } from './documents.controller';
import { GenerationJobsController } from './generation-jobs.controller';
import { DocumentsService } from './documents.service';
import { DocumentPreviewService } from './services/document-preview.service';
import { VariableValidationService } from './services/variable-validation.service';

@Module({
  imports: [StorageModule, TemplatesModule],
  controllers: [
    DocumentsController,
    AnalysisJobsController,
    GenerationJobsController,
  ],
  providers: [
    DocumentsService,
    DocumentPreviewService,
    DocumentRepository,
    AnalysisJobRepository,
    GenerationJobRepository,
    VariableValidationService,
    TenantRepository,
    UserRepository,
  ],
  exports: [DocumentsService, VariableValidationService],
})
export class DocumentsModule {}
