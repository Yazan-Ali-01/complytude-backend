import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../../categories/categories.service';
import {
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
} from '../dto/generate-document.dto';
import { TemplateValidationService } from './template-validation.service';
import { TemplateVersionsService } from '../template-versions.service';
import { ValidationException } from 'src/common/exceptions/validation.exception';

@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly templateValidationService: TemplateValidationService,
    private readonly templateVersionsService: TemplateVersionsService,
  ) {}

  async generateDocument(
    tenantId: string,
    userId: string,
    id: string,
    generateDocumentDto: GenerateDocumentDto,
  ): Promise<GenerateDocumentResponseDto | null> {
    this.logger.log(`Generating document for tenant ${tenantId}`);

    const { variables } = generateDocumentDto;

    const template = await this.templateVersionsService.getCurrentVersion(id);
    if (!template) {
      this.logger.error(
        `${tenantId} - ${userId} - ${id} - No active version for template`,
      );
      throw new NotFoundException(
        'There is no active version for this template',
      );
    }

    const validationResult = this.templateValidationService.validateVariables(
      template.fields,
      variables,
    );
    if (!validationResult.valid) {
      this.logger.error(
        `${tenantId} - ${userId} - ${id} - Validation errors: ${JSON.stringify(validationResult.errors)}`,
      );

      throw new ValidationException(validationResult.errors || []);
    }

    return null; // NOTE:not implemented yet
  }
}
