import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from '../tenant/tenant.module';

// Controllers
import { TemplatesController } from './templates.controller';
import { AuthoritiesController } from './authorities.controller';
import { CategoriesController } from './categories.controller';
import { RulesetsController } from './rulesets.controller';

// Services
import { TemplatesService } from './templates.service';
import { TemplateVersionsService } from './template-versions.service';
import { AuthoritiesService } from './authorities.service';
import { CategoriesService } from './categories.service';
import { RulesetsService } from './rulesets.service';
import { DocumentGenerationService } from './document-generation.service';
import { TemplateValidationService } from './template-validation.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocxPlaceholderExtractionService } from './services/docx-placeholder-extraction.service';

@Module({
  imports: [DatabaseModule, StorageModule, TenantModule],
  controllers: [
    TemplatesController,
    AuthoritiesController,
    CategoriesController,
    RulesetsController,
    DocumentsController,
  ],
  providers: [
    TemplatesService,
    TemplateVersionsService,
    AuthoritiesService,
    CategoriesService,
    RulesetsService,
    DocumentGenerationService,
    TemplateValidationService,
    DocumentsService,
    DocxPlaceholderExtractionService,
  ],
  exports: [
    TemplatesService,
    TemplateVersionsService,
    AuthoritiesService,
    CategoriesService,
    RulesetsService,
    DocumentGenerationService,
    TemplateValidationService,
    DocumentsService,
    DocxPlaceholderExtractionService,
  ],
})
export class TemplatesModule {}
