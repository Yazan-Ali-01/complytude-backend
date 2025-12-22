import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from '../storage/storage.module';

// Controllers
import { TemplatesController } from 'src/modules/templates/templates.controller';

// Services
import { TemplatesService } from 'src/modules/templates/templates.service';
import { TemplateVersionsService } from 'src/modules/templates/template-versions.service';
import { DocumentGenerationService } from 'src/modules/templates/services/document-generation.service';
import { TemplateValidationService } from 'src/modules/templates/services/template-validation.service';
import { RulesetsModule } from '../rulesets/rulesets.module';

@Module({
  imports: [DatabaseModule, StorageModule, RulesetsModule],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateVersionsService,
    DocumentGenerationService,
    TemplateValidationService,
  ],
  exports: [
    TemplatesService,
    TemplateVersionsService,
    DocumentGenerationService,
    TemplateValidationService,
  ],
})
export class TemplatesModule {}
