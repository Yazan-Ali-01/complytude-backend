import { Module } from '@nestjs/common';
import { DatabaseModule, CategoryRepository, AuthorityRepository, RulesetRepository, TemplateRepository, TemplateVersionRepository } from '@complytude/shared';
import { StorageModule } from '../storage/storage.module';
import { RulesetsModule } from '../rulesets/rulesets.module';
import { TenantModule } from '../tenants/tenant.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { TemplateVersionsService } from './template-versions.service';
import { DocumentGenerationService } from './services/document-generation.service';
import { TemplateValidationService } from './services/template-validation.service';
import { DocxPlaceholderExtractionService } from './services/docx-placeholder-extraction.service';

@Module({
  imports: [DatabaseModule, StorageModule, RulesetsModule, TenantModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateVersionsService,
    DocumentGenerationService,
    TemplateValidationService,
    DocxPlaceholderExtractionService,
    TemplateRepository,
    TemplateVersionRepository,
    CategoryRepository,
    AuthorityRepository,
    RulesetRepository,
  ],
  exports: [
    TemplatesService,
    TemplateVersionsService,
    DocumentGenerationService,
    TemplateValidationService,
    DocxPlaceholderExtractionService,
    TemplateRepository,
    TemplateVersionRepository,
    CategoryRepository,
    AuthorityRepository,
    RulesetRepository,
  ],
})
export class TemplatesModule {}
