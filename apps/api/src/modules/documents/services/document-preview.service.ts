import { DatabaseService } from '@lib/database';
import {
  GENERATION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { EntitlementResolverService } from 'src/modules/entitlements/services/entitlement-resolver.service';
import type { GenerationJob } from 'src/repositories/generation-jobs/generation-job.repository';
import { GenerationJobRepository } from 'src/repositories/generation-jobs/generation-job.repository';
import type { AuthenticatedTenantUser } from '../../auth/strategies';
import {
  TIER_HIERARCHY,
  type TemplateTier,
} from '../../templates/constants/tier.constants';
import { TemplateVersionsService } from '../../templates/template-versions.service';
import { TemplatesService } from '../../templates/templates.service';
import { DocumentsI18n } from '../constants/i18n.constants';
import {
  GenerationJobResponseDto,
  type PreviewDocumentDto,
  type PreviewDocumentResponseDto,
} from '../dto';
import { DocumentsService } from '../documents.service';
import { VariableValidationService } from './variable-validation.service';

@Injectable()
export class DocumentPreviewService {
  private readonly logger = new Logger(DocumentPreviewService.name);

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateVersionsService: TemplateVersionsService,
    private readonly variableValidationService: VariableValidationService,
    private readonly generationJobRepository: GenerationJobRepository,
    private readonly queueProducerService: QueueProducerService,
    private readonly entitlementResolver: EntitlementResolverService,
    private readonly documentsService: DocumentsService,
    private readonly databaseService: DatabaseService,
    private readonly i18n: I18nService,
  ) {}

  async preview(
    dto: PreviewDocumentDto,
    user: AuthenticatedTenantUser,
  ): Promise<PreviewDocumentResponseDto> {
    const template = await this.templatesService.findByKey(dto.templateKey);

    if (template.status !== 'active' || !template.tier) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.TEMPLATE_NOT_FOUND),
      );
    }

    const targetVersion = dto.templateVersion ?? template.current_version;
    const templateVersion = await this.templateVersionsService.getVersion(
      template.id,
      targetVersion,
    );

    await this.enforceTierAccess(user.tenantId, template.tier);

    const { systemVariables } =
      await this.documentsService.getGenerationContext(user);

    const validatedVariables = this.variableValidationService.validate(
      templateVersion.fields,
      dto.variables,
      systemVariables,
    );

    try {
      const generationJob =
        await this.databaseService.transactionWithTenantContext(
          { tenantId: user.tenantId },
          async (client) => {
            return this.generationJobRepository.create(
              {
                tenant_id: user.tenantId,
                template_id: template.id,
                template_version_id: templateVersion.id,
                job_type: 'preview',
                status: 'queued',
                variables: JSON.stringify(validatedVariables),
                created_by: user.userId,
              },
              { client },
            );
          },
        );

      await this.queueProducerService.enqueue(
        QUEUE_NAMES.DOCUMENT_GENERATION,
        GENERATION_JOB_NAMES.DOCUMENT_GENERATION,
        {
          generationJobId: generationJob.id,
          templateId: template.id,
          templateVersionId: templateVersion.id,
          templateVersion: targetVersion,
          variables: validatedVariables,
          tenantId: user.tenantId,
          userId: user.userId,
          jobType: 'preview',
        },
        { jobId: `preview-${generationJob.id}` },
      );

      this.logger.log(
        `Enqueued preview job: generationJobId=${generationJob.id} templateKey=${dto.templateKey} version=${targetVersion} tenantId=${user.tenantId}`,
      );

      return { generationJobId: generationJob.id };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(
        `Preview enqueue failed: templateKey=${dto.templateKey} version=${targetVersion} tenantId=${user.tenantId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.PREVIEW_GENERATION_FAILED),
      );
    }
  }

  async getGenerationJobById(
    jobId: string,
    user: AuthenticatedTenantUser,
  ): Promise<GenerationJobResponseDto> {
    const job = await this.generationJobRepository.findByIdForTenant(
      jobId,
      user.tenantId,
    );

    if (!job) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.GENERATION_JOB_NOT_FOUND),
      );
    }

    return this.mapToDto(job);
  }

  private mapToDto(job: GenerationJob): GenerationJobResponseDto {
    const dto = new GenerationJobResponseDto();
    dto.id = job.id;
    dto.status = job.status;
    dto.jobType = job.job_type;
    dto.templateId = job.template_id;
    dto.startedAt = job.started_at?.toISOString() ?? null;
    dto.completedAt = job.completed_at?.toISOString() ?? null;
    dto.result = job.result;
    dto.error = job.error;
    return dto;
  }

  private isTemplateTier(value: string): value is TemplateTier {
    return value in TIER_HIERARCHY;
  }

  private async enforceTierAccess(
    tenantId: string,
    requiredTier: TemplateTier,
  ): Promise<void> {
    const entitlement = await this.entitlementResolver.resolveForTenant(
      tenantId,
      'template_library',
    );

    const tenantTier = entitlement?.value_text;

    if (!tenantTier || !this.isTemplateTier(tenantTier)) {
      throw new ForbiddenException(
        this.i18n.t(DocumentsI18n.errors.TEMPLATE_TIER_FORBIDDEN),
      );
    }

    const tenantLevel = TIER_HIERARCHY[tenantTier];
    const requiredLevel = TIER_HIERARCHY[requiredTier];

    if (tenantLevel < requiredLevel) {
      this.logger.warn(
        `Tier access denied: tenantId=${tenantId} tenantTier=${tenantTier} requiredTier=${requiredTier}`,
      );
      throw new ForbiddenException(
        this.i18n.t(DocumentsI18n.errors.TEMPLATE_TIER_FORBIDDEN),
      );
    }
  }
}
