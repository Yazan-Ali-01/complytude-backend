import { Module } from '@nestjs/common';
import { DatabaseModule, CategoryRepository, AuthorityRepository, RulesetRepository, TemplateRepository, TemplateVersionRepository } from '@complytude/shared';

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
