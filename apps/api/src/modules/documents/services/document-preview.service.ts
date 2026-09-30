import { DatabaseService } from '@lib/database';
import { RedisService } from '@lib/redis';
import {
  ENTITLEMENT_JOB_NAMES,
  GENERATION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { EntitlementEnforcementService } from 'src/modules/entitlements/services/entitlement-enforcement.service';
import { EntitlementResolverService } from 'src/modules/entitlements/services/entitlement-resolver.service';
import { usageRefusedException } from 'src/modules/entitlements/utils/usage-refusal.util';
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
  GenerateDocumentResponseDto,
  GenerationJobResponseDto,
  type GenerateDocumentDto,
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
    private readonly entitlementEnforcement: EntitlementEnforcementService,
    private readonly documentsService: DocumentsService,
    private readonly databaseService: DatabaseService,
    private readonly i18n: I18nService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
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
    await this.enforcePreviewCap(user.tenantId);

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

  async generate(
    dto: GenerateDocumentDto,
    user: AuthenticatedTenantUser,
  ): Promise<GenerateDocumentResponseDto> {
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
            // Create the job first so we have the ID available for entitlement metadata.
            const job = await this.generationJobRepository.create(
              {
                tenant_id: user.tenantId,
                template_id: template.id,
                template_version_id: templateVersion.id,
                job_type: 'generate',
                status: 'queued',
                variables: JSON.stringify(validatedVariables),
                created_by: user.userId,
              },
              { client },
            );

            // Check and record documents_per_month quota within the same transaction.
            // If denied, the transaction rolls back — no job record is created and no
            // quota is consumed. Passing resource_id links the usage event to this job
            // so the refund handler can locate and void it later on permanent failure.
            const checkResult =
              await this.entitlementEnforcement.checkAndRecord(
                {
                  tenantId: user.tenantId,
                  featureKey: 'documents_per_month',
                  userId: user.userId,
                  units: 1,
                  metadata: {
                    resource_id: job.id,
                    resource_type: 'generation_job',
                    template_key: dto.templateKey,
                    template_version: targetVersion,
                  },
                },
                { client },
              );

            if (!checkResult.allowed) {
              throw usageRefusedException(
                'documents_per_month',
                checkResult,
                this.i18n,
              );
            }

            return job;
          },
        );

      try {
        await this.queueProducerService.enqueue(
          QUEUE_NAMES.DOCUMENT_GENERATION,
          GENERATION_JOB_NAMES.DOCUMENT_GENERATION,
          {
            generationJobId: generationJob.id,
            templateId: template.id,
            templateVersionId: templateVersion.id,
            templateVersion: targetVersion,
            tenantId: user.tenantId,
            userId: user.userId,
            jobType: 'generate',
          },
          { jobId: `generate-${generationJob.id}` },
        );
      } catch (enqueueError) {
        this.logger.error(
          `Generate enqueue failed after entitlement deduction: generationJobId=${generationJob.id} tenantId=${user.tenantId} error=${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`,
        );
        await this.refundUsageOnEnqueueFailure(generationJob.id, user.tenantId);
        throw enqueueError;
      }

      this.logger.log(
        `Enqueued generate job: generationJobId=${generationJob.id} templateKey=${dto.templateKey} version=${targetVersion} tenantId=${user.tenantId}`,
      );

      return { generationJobId: generationJob.id };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof HttpException
      ) {
        throw error;
      }
      this.logger.error(
        `Generate failed: templateKey=${dto.templateKey} version=${targetVersion} tenantId=${user.tenantId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_GENERATION_FAILED),
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
      { tenant: { tenantId: user.tenantId, schema: 'public' as const } },
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

  /**
   * Best-effort refund when enqueue fails after the transaction committed.
   * Enqueues the same USAGE_REFUND job the worker uses so the refund handler
   * can void the ledger entry and rebuild the projection.
   */
  private async refundUsageOnEnqueueFailure(
    generationJobId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      await this.queueProducerService.enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId,
          resourceId: generationJobId,
          resourceType: 'generation_job',
          featureKey: 'documents_per_month',
          units: 1,
        },
        { jobId: `usage-refund-enqueue-fail-${generationJobId}` },
      );
      this.logger.log(
        `Enqueued USAGE_REFUND after enqueue failure: generationJobId=${generationJobId} tenantId=${tenantId}`,
      );
    } catch (refundError) {
      this.logger.error(
        `Failed to enqueue USAGE_REFUND after enqueue failure: generationJobId=${generationJobId} tenantId=${tenantId} error=${refundError instanceof Error ? refundError.message : String(refundError)}`,
      );
    }
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

  /**
   * Previews cost nothing but each is a document conversion on the shared generation worker, so a
   * tenant gets at most PREVIEW_DAILY_LIMIT a day (UTC). If Redis can't count, the preview goes
   * ahead: the per-minute rate limit still applies.
   */
  private async enforcePreviewCap(tenantId: string): Promise<void> {
    const limit = this.configService.get<number>('PREVIEW_DAILY_LIMIT') ?? 50;
    const now = new Date();
    const key = `preview-cap:${tenantId}:${now.toISOString().slice(0, 10)}`;
    let count: number;
    try {
      count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 2 * 24 * 60 * 60);
    } catch (error) {
      this.logger.warn(
        `Preview cap not checked for tenant=${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (count > limit) {
      const nextDay = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: this.i18n.t(DocumentsI18n.errors.PREVIEW_DAILY_LIMIT, {
            args: { limit },
          }),
          retryAfterSeconds: Math.ceil((nextDay - now.getTime()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
