import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from '../storage/storage.module';
import { TenantModule } from 'src/modules/tenants/tenant.module';

// Controllers
import { TemplatesController } from 'src/modules/templates/templates.controller';

// Services
import { TemplatesService } from 'src/modules/templates/templates.service';
import { TemplateVersionsService } from 'src/modules/templates/template-versions.service';
import { DocumentGenerationService } from 'src/modules/templates/services/document-generation.service';
import { TemplateValidationService } from 'src/modules/templates/services/template-validation.service';
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
  ],
  exports: [
    TemplatesService,
    TemplateVersionsService,
    DocumentGenerationService,
    TemplateValidationService,
    DocxPlaceholderExtractionService,
  ],
})
export class TemplatesModule {}
