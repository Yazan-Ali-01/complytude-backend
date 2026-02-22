import { Module } from '@nestjs/common';
import { TenantModule } from 'src/modules/tenants/tenant.module';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../storage/storage.module';

// Controllers
import { TemplatesController } from 'src/modules/templates/templates.controller';

// Services
import { DocumentGenerationService } from 'src/modules/templates/services/document-generation.service';
import { TemplateValidationService } from 'src/modules/templates/services/template-validation.service';
import { TemplateVersionsService } from 'src/modules/templates/template-versions.service';
import { TemplatesService } from 'src/modules/templates/templates.service';
import { AuthorityRepository } from '../../repositories/authorities/authority.repository';
import { CategoryRepository } from '../../repositories/categories/category.repository';
import { RulesetRepository } from '../../repositories/rulesets/ruleset.repository';
import { TemplateVersionRepository } from '../../repositories/templates/template-version.repository';
import { TemplateRepository } from '../../repositories/templates/template.repository';
import { RulesetsModule } from '../rulesets/rulesets.module';
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
