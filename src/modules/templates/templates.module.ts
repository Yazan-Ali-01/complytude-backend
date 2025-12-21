import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../core/database/database.module';
import { StorageModule } from '../storage/storage.module';

// Controllers
import { TemplatesController } from './templates/templates.controller';
import { AuthoritiesController } from './authorities/authorities.controller';
import { CategoriesController } from './categories/categories.controller';
import { RulesetsController } from './rulesets/rulesets.controller';

// Services
import { TemplatesService } from './templates/templates.service';
import { TemplateVersionsService } from './templates/template-versions.service';
import { AuthoritiesService } from './authorities/authorities.service';
import { CategoriesService } from './categories/categories.service';
import { RulesetsService } from './rulesets/rulesets.service';
import { DocumentGenerationService } from './templates/services/document-generation.service';
import { TemplateValidationService } from './templates/services/template-validation.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [
    TemplatesController,
    AuthoritiesController,
    CategoriesController,
    RulesetsController,
  ],
  providers: [
    TemplatesService,
    TemplateVersionsService,
    AuthoritiesService,
    CategoriesService,
    RulesetsService,
    DocumentGenerationService,
    TemplateValidationService,
  ],
  exports: [
    TemplatesService,
    TemplateVersionsService,
    AuthoritiesService,
    CategoriesService,
    RulesetsService,
    DocumentGenerationService,
    TemplateValidationService,
  ],
})
export class TemplatesModule {}
