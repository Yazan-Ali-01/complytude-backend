import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../storage/storage.module';

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
