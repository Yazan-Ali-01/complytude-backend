import { countPdfPages, UnreadablePdfError } from '@lib/pdf';
import { DatabaseService } from '@lib/database';
import {
  AI_JOB_NAMES,
  type AnalysisDocumentType,
  type AnalysisJurisdiction,
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import type { PoolClient } from 'pg';
import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import {
  Document,
  DocumentRepository,
} from 'src/repositories/documents/document.repository';
import { RulesetRepository } from 'src/repositories/rulesets/ruleset.repository';
import { TenantRepository } from 'src/repositories/tenants/tenant.repository';
import { UserRepository } from 'src/repositories/users/user.repository';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { User } from '../users/entities/user.entity';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { EntitlementEnforcementService } from '../entitlements/services/entitlement-enforcement.service';
import { EntitlementResolverService } from '../entitlements/services/entitlement-resolver.service';
import { usageRefusedException } from '../entitlements/utils/usage-refusal.util';
import { StorageService } from '../storage/storage.service';
import { TenantsI18n } from '../tenants/constants/i18n.constants';
import { UsersI18n } from '../users/constants/i18n.constants';
import { DocumentsI18n } from './constants/i18n.constants';
import {
  resultForRiskLevel,
  type RiskAnalysisLevel,
} from './services/analysis-risk-level';
import { UPLOAD_MAX_FILE_SIZE_BYTES } from './constants/upload.constants';
import type {
  AnalysisJobResponseDto,
  AnalysisScopeDto,
  AnalyzeDocumentDto,
  AnalyzeDocumentResponseDto,
  ConfirmUploadResponseDto,
  DeleteDocumentResponseDto,
  DocumentDownloadUrlResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  DocumentSummaryDto,
  GenerationContextResponseDto,
  ListDocumentsQueryDto,
  UploadUrlDto,
  UploadUrlResponseDto,
} from './dto';

type GenerationContext = {
  user: User;
  tenant: Tenant;
  locale: string;
};

function formatDateLong(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

const SYSTEM_VARIABLE_RESOLVERS: Record<
  string,
  (ctx: GenerationContext) => string
> = {
  generated_date: () => new Date().toISOString().split('T')[0],
  generated_date_formatted: (ctx) => formatDateLong(new Date(), ctx.locale),
  tenant_name: (ctx) => ctx.tenant.name ?? '',
  tenant_trade_license_number: (ctx) => ctx.tenant.trade_license_number ?? '',
  user_full_name: (ctx) =>
    [ctx.user.first_name, ctx.user.last_name].filter(Boolean).join(' '),
  user_email: (ctx) => ctx.user.email,
};

/** Every PDF starts with these bytes. */
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentRepository: DocumentRepository,
    private readonly analysisJobRepository: AnalysisJobRepository,
    private readonly queueProducerService: QueueProducerService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
    private readonly tenantRepository: TenantRepository,
    private readonly userRepository: UserRepository,
    private readonly rulesetRepository: RulesetRepository,
    private readonly entitlementEnforcement: EntitlementEnforcementService,
    private readonly entitlementResolver: EntitlementResolverService,
  ) {}

  /**
   * Counts one use of a paid feature against the tenant's allowance (or credits), linked to the
   * resource it pays for so a permanent failure can refund it. Refused: 402, and the caller's
   * transaction rolls back, so nothing is created.
   */
  private async consume(
    user: AuthenticatedTenantUser,
    featureKey: 'contract_reviews_per_month' | 'document_scans',
    resource: { id: string; type: 'analysis_job' | 'document_scan' },
    client: PoolClient,
  ): Promise<void> {
    const result = await this.entitlementEnforcement.checkAndRecord(
      {
        tenantId: user.tenantId,
        featureKey,
        userId: user.userId,
        units: 1,
        metadata: { resource_id: resource.id, resource_type: resource.type },
      },
      { client },
    );
    if (!result.allowed) {
      throw usageRefusedException(featureKey, result, this.i18n);
    }
  }

  async getGenerationContext(
    user: AuthenticatedTenantUser,
  ): Promise<GenerationContextResponseDto> {
    try {
      const [tenant, dbUser] = await Promise.all([
        this.tenantRepository.findById(user.tenantId, {
          tenant: { tenantId: user.tenantId, schema: 'public' as const },
        }),
        this.userRepository.findById(user.userId),
      ]);

      if (!tenant) {
        throw new NotFoundException(
          this.i18n.t(TenantsI18n.errors.TENANT_NOT_FOUND, {
            args: { tenantId: user.tenantId },
          }),
        );
      }
      if (!dbUser) {
        throw new NotFoundException(
          this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
            args: { userId: user.userId },
          }),
        );
      }

      const ctx: GenerationContext = {
        user: dbUser,
        tenant,
        locale: tenant.locale ?? 'en',
      };

      const systemVariables = Object.fromEntries(
        Object.entries(SYSTEM_VARIABLE_RESOLVERS).map(([key, resolve]) => [
          key,
          resolve(ctx),
        ]),
      );

      return { systemVariables };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `getGenerationContext failed: tenantId=${user.tenantId} userId=${user.userId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.GENERATION_CONTEXT_FAILED),
      );
    }
  }

  async analyze(
    dto: AnalyzeDocumentDto,
    user: AuthenticatedTenantUser,
  ): Promise<AnalyzeDocumentResponseDto> {
    try {
      const scope = await this.resolveScope(dto);

      const { documentId, analysisJobId } =
        await this.databaseService.transactionWithTenantContext(
          { tenantId: user.tenantId },
          async (client) => {
            const document = await this.documentRepository.create(
              {
                tenant_id: user.tenantId,
                title: dto.title,
                source_type: 'text_input',
                content: dto.content,
                created_by: user.userId,
              },
              { client },
            );

            this.logger.log(
              `Document created: documentId=${document.id} tenantId=${user.tenantId} userId=${user.userId}`,
            );

            const analysisJob = await this.analysisJobRepository.create(
              {
                tenant_id: user.tenantId,
                document_id: document.id,
                created_by: user.userId,
                status: 'queued',
              },
              { client },
            );
            await this.consume(
              user,
              'contract_reviews_per_month',
              { id: analysisJob.id, type: 'analysis_job' },
              client,
            );

            return { documentId: document.id, analysisJobId: analysisJob.id };
          },
        );

      await this.queueProducerService.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        AI_JOB_NAMES.DOCUMENT_ANALYSIS,
        { analysisJobId, documentId, tenantId: user.tenantId, ...scope },
        { jobId: `doc-analysis-${analysisJobId}` },
      );

      this.logger.log(
        `Enqueued document-analysis job: documentId=${documentId} analysisJobId=${analysisJobId} tenantId=${user.tenantId} scoped to ${scope.rulesetIds.length} rulesets`,
      );

      return { documentId, analysisJobId };
    } catch (error) {
      this.logger.error(
        `Document analysis failed: tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async getUploadUrl(
    dto: UploadUrlDto,
    user: AuthenticatedTenantUser,
  ): Promise<UploadUrlResponseDto> {
    const maxFileSize: number =
      this.configService.get<number>('storage.upload.maxFileSize') ??
      UPLOAD_MAX_FILE_SIZE_BYTES;
    const expiresIn: number =
      this.configService.get<number>('storage.signedUrl.expiresIn') ?? 900;
    const quarantineBucket: string =
      this.configService.get<string>('storage.quarantine.bucketName') ??
      'complytude-quarantine';

    if (dto.fileSizeBytes > maxFileSize) {
      throw new BadRequestException(
        this.i18n.t(DocumentsI18n.errors.FILE_SIZE_EXCEEDS_LIMIT),
      );
    }

    // The key is ASCII and fixed; the name the user gave (Arabic included) is kept in the row
    const documentId = crypto.randomUUID();
    const s3Key = `tenants/${user.tenantId}/documents/${documentId}/document.pdf`;
    const originalFilename = dto.filename.trim();

    try {
      await this.databaseService.transactionWithTenantContext(
        { tenantId: user.tenantId },
        async (client) => {
          await this.documentRepository.createWithId(
            documentId,
            {
              tenant_id: user.tenantId,
              title: originalFilename,
              created_by: user.userId,
              source_type: 'file_upload',
              s3_key: s3Key,
              s3_bucket: quarantineBucket,
              original_filename: originalFilename,
              file_size_bytes: dto.fileSizeBytes,
              mime_type: dto.contentType,
              extraction_status: 'pending',
            },
            { client },
          );
        },
      );

      const uploadUrl = await this.storageService.generatePresignedPutUrl(
        s3Key,
        dto.contentType,
        expiresIn,
      );

      this.logger.log(
        `Upload URL generated: documentId=${documentId} tenantId=${user.tenantId} s3Key=${s3Key}`,
      );

      return {
        documentId,
        uploadUrl,
        expiresIn,
        s3Key,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `getUploadUrl failed: tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.UPLOAD_URL_GENERATION_FAILED),
      );
    }
  }

  async confirmUpload(
    documentId: string,
    user: AuthenticatedTenantUser,
  ): Promise<ConfirmUploadResponseDto> {
    try {
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      // First fetch the document to provide accurate error codes —
      // we need to distinguish "not found" vs "wrong type" vs "already confirmed".
      const existing = await this.documentRepository.findActiveById(
        documentId,
        { tenant: tenantContext },
      );
      if (!existing) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
        );
      }
      if (existing.source_type !== 'file_upload') {
        throw new BadRequestException(
          this.i18n.t(DocumentsI18n.errors.INVALID_DOCUMENT_TYPE),
        );
      }
      if (existing.extraction_status !== 'pending') {
        throw new ConflictException(
          this.i18n.t(DocumentsI18n.errors.UPLOAD_ALREADY_CONFIRMED),
        );
      }

      // Atomic claim: UPDATE … WHERE extraction_status = 'pending'
      // prevents a concurrent request from double-enqueuing.
      const document = await this.documentRepository.claimPendingUpload(
        documentId,
        { tenant: tenantContext },
      );
      if (!document) {
        throw new ConflictException(
          this.i18n.t(DocumentsI18n.errors.UPLOAD_ALREADY_CONFIRMED),
        );
      }

      const s3Key = document.s3_key!;
      const objectMeta =
        await this.storageService.getQuarantineObjectMetadata(s3Key);

      if (!objectMeta) {
        await this.documentRepository.update(
          documentId,
          { extraction_status: 'pending' },
          { tenant: tenantContext },
        );
        throw new BadRequestException(
          this.i18n.t(DocumentsI18n.errors.FILE_NOT_UPLOADED),
        );
      }

      const declaredSize = document.file_size_bytes ?? 0;
      const tolerance = Math.max(Math.ceil(declaredSize * 0.01), 1024);
      if (Math.abs(objectMeta.contentLength - declaredSize) > tolerance) {
        await this.documentRepository.update(
          documentId,
          { extraction_status: 'pending' },
          { tenant: tenantContext },
        );
        throw new BadRequestException(
          this.i18n.t(DocumentsI18n.errors.FILE_SIZE_MISMATCH),
        );
      }

      // OCR bills every page it reads: refuse an over-limit PDF before any job exists
      if ((document.mime_type ?? 'application/pdf') === 'application/pdf') {
        const refusal = await this.checkPdfPageLimit(s3Key);
        if (refusal) {
          await this.documentRepository.update(
            documentId,
            { extraction_status: 'pending' },
            { tenant: tenantContext },
          );
          throw new BadRequestException(refusal);
        }
      }

      // Reading the upload (locally, or OCR for scanned pages) uses one of the plan's scans
      try {
        await this.databaseService.transactionWithTenantContext(
          { tenantId: user.tenantId },
          (client) =>
            this.consume(
              user,
              'document_scans',
              { id: document.id, type: 'document_scan' },
              client,
            ),
        );
      } catch (error) {
        await this.documentRepository.update(
          documentId,
          { extraction_status: 'pending' },
          { tenant: tenantContext },
        );
        throw error;
      }

      await this.queueProducerService.enqueue(
        QUEUE_NAMES.DATA_INGESTION,
        INGESTION_JOB_NAMES.DOCUMENT_INGESTION,
        {
          documentId: document.id,
          tenantId: user.tenantId,
          s3Key,
          s3Bucket: this.storageService.quarantineBucketName,
          mimeType: document.mime_type ?? 'application/pdf',
          originalFilename: document.original_filename ?? document.title,
        },
        { jobId: `doc-ingestion-${document.id}` },
      );

      this.logger.log(
        `Enqueued DOCUMENT_INGESTION job: documentId=${document.id} tenantId=${user.tenantId}`,
      );

      return {
        documentId: document.id,
        status: 'processing',
        message: this.i18n.t(DocumentsI18n.messages.UPLOAD_CONFIRMED),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `confirmUpload failed: documentId=${documentId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.UPLOAD_URL_GENERATION_FAILED),
      );
    }
  }

  async triggerAnalysis(
    documentId: string,
    dto: AnalysisScopeDto,
    user: AuthenticatedTenantUser,
  ): Promise<AnalyzeDocumentResponseDto> {
    try {
      const scope = await this.resolveScope(dto);
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      const document = await this.documentRepository.findActiveById(
        documentId,
        { tenant: tenantContext },
      );
      if (!document) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
        );
      }
      if (document.source_type !== 'file_upload') {
        throw new BadRequestException(
          this.i18n.t(DocumentsI18n.errors.INVALID_DOCUMENT_TYPE),
        );
      }
      if (document.extraction_status !== 'completed') {
        throw new BadRequestException(
          this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_EXTRACTED),
        );
      }

      const analysisJob =
        await this.databaseService.transactionWithTenantContext(
          { tenantId: user.tenantId },
          async (client) => {
            const job = await this.analysisJobRepository.create(
              {
                tenant_id: user.tenantId,
                document_id: documentId,
                created_by: user.userId,
                status: 'queued',
              },
              { client },
            );
            await this.consume(
              user,
              'contract_reviews_per_month',
              { id: job.id, type: 'analysis_job' },
              client,
            );
            return job;
          },
        );

      await this.queueProducerService.enqueue(
        QUEUE_NAMES.AI_PROCESSING,
        AI_JOB_NAMES.DOCUMENT_ANALYSIS,
        {
          analysisJobId: analysisJob.id,
          documentId,
          tenantId: user.tenantId,
          ...scope,
        },
        { jobId: `doc-analysis-${analysisJob.id}` },
      );

      this.logger.log(
        `Enqueued document-analysis job: documentId=${documentId} analysisJobId=${analysisJob.id} tenantId=${user.tenantId} scoped to ${scope.rulesetIds.length} rulesets`,
      );

      return { documentId, analysisJobId: analysisJob.id };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `triggerAnalysis failed: documentId=${documentId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_RETRIEVAL_FAILED),
      );
    }
  }

  /**
   * Get the latest analysis job for a document.
   * Tenant-scoped via RLS; returns 404 if document or job not found.
   */
  async getLatestAnalysis(
    documentId: string,
    user: AuthenticatedTenantUser,
  ): Promise<AnalysisJobResponseDto> {
    try {
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      const document = await this.documentRepository.findActiveById(
        documentId,
        { tenant: tenantContext },
      );
      if (!document) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
        );
      }

      const job = await this.analysisJobRepository.findLatestByDocument(
        documentId,
        { tenant: tenantContext },
      );
      if (!job) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.NO_ANALYSIS_JOB_FOR_DOCUMENT),
        );
      }

      return this.mapAnalysisJobToDto(job, user.tenantId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `getLatestAnalysis failed: documentId=${documentId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Get a specific analysis job by ID.
   * Tenant-scoped via RLS; returns 404 if not found.
   */
  async getAnalysisJobById(
    analysisJobId: string,
    user: AuthenticatedTenantUser,
  ): Promise<AnalysisJobResponseDto> {
    try {
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      const job = await this.analysisJobRepository.findById(analysisJobId, {
        tenant: tenantContext,
      });
      // A deleted document's analyses go with it
      const document =
        job &&
        (await this.documentRepository.findActiveById(job.document_id, {
          tenant: tenantContext,
        }));
      if (!job || !document) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.ANALYSIS_JOB_NOT_FOUND),
        );
      }

      return this.mapAnalysisJobToDto(job, user.tenantId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `getAnalysisJobById failed: analysisJobId=${analysisJobId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /** The job as the tenant sees it: the result filtered by its plan's risk analysis level. */
  private async mapAnalysisJobToDto(
    job: {
      id: string;
      document_id: string;
      status: string;
      result: Record<string, unknown> | null;
      error: string | null;
      started_at: Date | null;
      completed_at: Date | null;
    },
    tenantId: string,
  ): Promise<AnalysisJobResponseDto> {
    const level = (
      await this.entitlementResolver.resolveForTenant(
        tenantId,
        'risk_analysis_level',
      )
    )?.value_text as RiskAnalysisLevel | undefined;
    return {
      id: job.id,
      status: job.status as AnalysisJobResponseDto['status'],
      documentId: job.document_id,
      startedAt: job.started_at?.toISOString() ?? null,
      completedAt: job.completed_at?.toISOString() ?? null,
      result: resultForRiskLevel(job.result ?? null, level),
      error: job.error ?? null,
    };
  }

  async findAll(
    query: ListDocumentsQueryDto,
    user: AuthenticatedTenantUser,
  ): Promise<DocumentListResponseDto> {
    try {
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      const result = await this.documentRepository.findMany(
        {
          search: query.search,
        },
        {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        { tenant: tenantContext },
      );

      return {
        data: result.data.map((doc) => this.mapToSummary(doc)),
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
        },
      };
    } catch (error) {
      this.logger.error(
        `findAll failed: tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_LIST_FAILED),
      );
    }
  }

  async findOne(
    id: string,
    user: AuthenticatedTenantUser,
  ): Promise<DocumentResponseDto> {
    try {
      const tenantContext = {
        tenantId: user.tenantId,
        schema: 'public' as const,
      };

      const document = await this.documentRepository.findActiveById(id, {
        tenant: tenantContext,
      });

      if (!document) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
        );
      }

      return this.mapToResponse(document);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `findOne failed: documentId=${id} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_RETRIEVAL_FAILED),
      );
    }
  }

  async getDownloadUrl(
    id: string,
    user: AuthenticatedTenantUser,
  ): Promise<DocumentDownloadUrlResponseDto> {
    const tenantContext = {
      tenantId: user.tenantId,
      schema: 'public' as const,
    };

    const document = await this.documentRepository.findActiveById(id, {
      tenant: tenantContext,
    });

    if (!document) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
      );
    }

    if (!document.s3_key || !document.s3_bucket) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_NO_FILE),
      );
    }

    // An upload stays in quarantine until it is scanned and promoted; one refused by a check
    // stays there. Neither is handed out.
    if (document.s3_bucket === this.storageService.quarantineBucketName) {
      throw new ConflictException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_READY),
      );
    }

    const expiresIn: number =
      this.configService.get<number>('storage.signedUrl.expiresIn') ?? 900;

    const url = await this.storageService.generateSignedUrlForBucket(
      user.tenantId,
      document.s3_bucket,
      document.s3_key,
      expiresIn,
      // Downloaded, never rendered inline from our bucket, under the name the user gave it
      document.original_filename ?? document.title,
    );

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return { url, expiresAt };
  }

  async remove(
    id: string,
    user: AuthenticatedTenantUser,
  ): Promise<DeleteDocumentResponseDto> {
    const tenantContext = {
      tenantId: user.tenantId,
      schema: 'public' as const,
    };

    const document = await this.documentRepository.findActiveById(id, {
      tenant: tenantContext,
    });

    if (!document) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
      );
    }

    let deletedAt: string;
    try {
      const deleted = await this.documentRepository.softDelete(
        id,
        user.userId,
        { tenant: tenantContext },
      );
      deletedAt = deleted.deleted_at!.toISOString();
    } catch (error) {
      this.logger.error(
        `remove soft-delete failed: documentId=${id} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_DELETE_FAILED),
      );
    }

    if (document.s3_key && document.s3_bucket) {
      void this.storageService
        .deleteObjectFromBucket(document.s3_bucket, document.s3_key)
        .catch((error: unknown) => {
          this.logger.error(
            `S3 cleanup failed (document soft-deleted): documentId=${id} bucket=${document.s3_bucket} key=${document.s3_key} - ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        });
    }

    this.logger.log(
      `Document soft-deleted: documentId=${id} tenantId=${user.tenantId} userId=${user.userId}`,
    );

    return {
      id,
      message: this.i18n.t(DocumentsI18n.messages.DOCUMENT_DELETED),
      deletedAt,
    };
  }

  /** Why an uploaded PDF can't be extracted (too many pages, unreadable), or null if it can. */
  private async checkPdfPageLimit(s3Key: string): Promise<string | null> {
    const maxPages = this.configService.get<number>('DOCUMENT_MAX_PAGES') ?? 50;
    try {
      const file = await this.storageService.getQuarantineObjectBuffer(s3Key);
      // What was uploaded must be a PDF, whatever Content-Type the upload claimed
      if (!file.subarray(0, 5).equals(PDF_MAGIC)) {
        return this.i18n.t(DocumentsI18n.errors.INVALID_PDF);
      }
      const pages = await countPdfPages(file);
      return pages > maxPages
        ? this.i18n.t(DocumentsI18n.errors.TOO_MANY_PAGES, {
            args: { pages, maxPages },
          })
        : null;
    } catch (error) {
      if (error instanceof UnreadablePdfError) {
        return this.i18n.t(DocumentsI18n.errors.INVALID_PDF);
      }
      throw error;
    }
  }

  /**
   * Merge explicit rulesetIds with IDs resolved from rulesetKeys.
   * Returns deduplicated UUID array; empty array = global (unscoped) search. An unknown or
   * inactive ruleset is a 400: ignoring it would quietly check the document against the wrong
   * rules (or, if none are left, against all of them).
   */
  /**
   * The rulesets a contract is checked against: the ones picked explicitly, or else the active
   * rulesets tagged with its jurisdiction and document type. Never every ruleset: federal labour
   * law checked against a DIFC contract is a confident, wrong finding.
   */
  private async resolveScope(scope: AnalysisScopeDto): Promise<{
    rulesetIds: string[];
    jurisdiction?: AnalysisJurisdiction;
    documentType?: AnalysisDocumentType;
  }> {
    const context = {
      ...(scope.jurisdiction && { jurisdiction: scope.jurisdiction }),
      ...(scope.documentType && { documentType: scope.documentType }),
    };
    if (scope.rulesetIds?.length || scope.rulesetKeys?.length) {
      const rulesetIds = await this.resolveRulesetIds(
        scope.rulesetIds,
        scope.rulesetKeys,
      );
      return { rulesetIds, ...context };
    }
    if (!scope.jurisdiction || !scope.documentType) {
      throw new BadRequestException(
        this.i18n.t(DocumentsI18n.errors.ANALYSIS_SCOPE_REQUIRED),
      );
    }
    const applicable = await this.rulesetRepository.findApplicable(
      scope.jurisdiction,
      scope.documentType,
    );
    if (applicable.length === 0) {
      throw new BadRequestException(
        this.i18n.t(DocumentsI18n.errors.NO_APPLICABLE_RULESETS, {
          args: {
            jurisdiction: scope.jurisdiction,
            documentType: scope.documentType,
          },
        }),
      );
    }
    return { rulesetIds: applicable.map((r) => r.id), ...context };
  }

  private async resolveRulesetIds(
    rulesetIds?: string[],
    rulesetKeys?: string[],
  ): Promise<string[]> {
    const ids = new Set<string>();
    const missing: string[] = [];

    if (rulesetKeys?.length) {
      const rulesets = await this.rulesetRepository.findByKeys(rulesetKeys);
      const resolvedKeys = new Set(rulesets.map((r) => r.key));
      rulesets.forEach((rs) => ids.add(rs.id));
      missing.push(...rulesetKeys.filter((k) => !resolvedKeys.has(k)));
    }

    if (rulesetIds?.length) {
      const active = await this.rulesetRepository.findActiveIds(rulesetIds);
      rulesetIds.forEach((id) =>
        active.has(id) ? ids.add(id) : missing.push(id),
      );
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        this.i18n.t(DocumentsI18n.errors.RULESET_NOT_FOUND, {
          args: { rulesets: missing.join(', ') },
        }),
      );
    }

    return Array.from(ids);
  }

  private mapToSummary(doc: Document): DocumentSummaryDto {
    return {
      id: doc.id,
      title: doc.title,
      sourceType: doc.source_type,
      originalFilename: doc.original_filename,
      mimeType: doc.mime_type,
      fileSizeBytes: doc.file_size_bytes,
      extractionStatus: doc.extraction_status,
      createdBy: doc.created_by,
      createdAt: doc.created_at.toISOString(),
      updatedAt: doc.updated_at.toISOString(),
    };
  }

  private mapToResponse(doc: Document): DocumentResponseDto {
    return {
      id: doc.id,
      tenantId: doc.tenant_id,
      title: doc.title,
      content: doc.content,
      sourceType: doc.source_type,
      s3Key: doc.s3_key,
      s3Bucket: doc.s3_bucket,
      originalFilename: doc.original_filename,
      fileSizeBytes: doc.file_size_bytes,
      mimeType: doc.mime_type,
      extractionStatus: doc.extraction_status,
      extractionError: doc.extraction_error,
      extractedAt: doc.extracted_at?.toISOString() ?? null,
      createdBy: doc.created_by,
      createdAt: doc.created_at.toISOString(),
      updatedAt: doc.updated_at.toISOString(),
    };
  }
}
