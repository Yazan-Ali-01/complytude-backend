import { DatabaseService } from '@lib/database';
import { AI_JOB_NAMES, QUEUE_NAMES, QueueProducerService } from '@lib/queue';
import {
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { I18n, I18nService } from 'nestjs-i18n';
import { I18nKeys } from 'src/common/constants/i18n-keys';
import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import type {
  AnalysisJobResponseDto,
  AnalyzeDocumentDto,
  AnalyzeDocumentResponseDto,
  DeleteDocumentResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  GenerateDocumentDto,
  GenerateDocumentResponseDto,
  ListDocumentsQueryDto,
  PreviewDocumentDto,
  PreviewDocumentResponseDto,
} from './dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentRepository: DocumentRepository,
    private readonly analysisJobRepository: AnalysisJobRepository,
    private readonly queueProducerService: QueueProducerService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async analyze(
    dto: AnalyzeDocumentDto,
    user: AuthenticatedTenantUser,
  ): Promise<AnalyzeDocumentResponseDto> {
    const { documentId, analysisJobId } =
      await this.databaseService.transactionWithTenantContext(
        { tenantId: user.tenantId },
        async (client) => {
          const document = await this.documentRepository.create(
            {
              tenant_id: user.tenantId,
              title: dto.title,
              content: dto.content,
              created_by: user.userId,
              metadata: JSON.stringify({}),
            },
            { client },
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

          return { documentId: document.id, analysisJobId: analysisJob.id };
        },
      );

    await this.queueProducerService.enqueue(
      QUEUE_NAMES.AI_PROCESSING,
      AI_JOB_NAMES.DOCUMENT_ANALYSIS,
      { analysisJobId, documentId, tenantId: user.tenantId },
      { jobId: `doc-analysis-${analysisJobId}` },
    );

    this.logger.log(
      `Enqueued document-analysis job: documentId=${documentId} analysisJobId=${analysisJobId} tenantId=${user.tenantId}`,
    );

    return { documentId, analysisJobId };
  }

  /**
   * Get the latest analysis job for a document.
   * Tenant-scoped via RLS; returns 404 if document or job not found.
   */
  async getLatestAnalysis(
    documentId: string,
    user: AuthenticatedTenantUser,
  ): Promise<AnalysisJobResponseDto> {
    const tenantContext = {
      tenantId: user.tenantId,
      schema: 'public' as const,
    };

    const document = await this.documentRepository.findById(documentId, {
      tenant: tenantContext,
    });
    if (!document) {
      throw new NotFoundException(this.i18n.t(I18nKeys.DOCUMENT_NOT_FOUND));
    }

    const job = await this.analysisJobRepository.findLatestByDocument(
      documentId,
      { tenant: tenantContext },
    );
    if (!job) {
      throw new NotFoundException(
        this.i18n.t(I18nKeys.NO_ANALYSIS_JOB_FOR_DOCUMENT),
      );
    }

    return this.mapAnalysisJobToDto(job);
  }

  /**
   * Get a specific analysis job by ID.
   * Tenant-scoped via RLS; returns 404 if not found.
   */
  async getAnalysisJobById(
    analysisJobId: string,
    user: AuthenticatedTenantUser,
  ): Promise<AnalysisJobResponseDto> {
    const tenantContext = {
      tenantId: user.tenantId,
      schema: 'public' as const,
    };

    const job = await this.analysisJobRepository.findById(analysisJobId, {
      tenant: tenantContext,
    });
    if (!job) {
      throw new NotFoundException(this.i18n.t(I18nKeys.ANALYSIS_JOB_NOT_FOUND));
    }

    return this.mapAnalysisJobToDto(job);
  }

  private mapAnalysisJobToDto(job: {
    id: string;
    document_id: string;
    status: string;
    result: Record<string, unknown> | null;
    error: string | null;
    started_at: Date | null;
    completed_at: Date | null;
  }): AnalysisJobResponseDto {
    return {
      id: job.id,
      status: job.status as AnalysisJobResponseDto['status'],
      documentId: job.document_id,
      startedAt: job.started_at?.toISOString() ?? null,
      completedAt: job.completed_at?.toISOString() ?? null,
      result: job.result ?? null,
      error: job.error ?? null,
    };
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  preview(
    _dto: PreviewDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<PreviewDocumentResponseDto> {
    throw new NotImplementedException(
      this.i18n.t(I18nKeys.PREVIEW_NOT_IMPLEMENTED),
    );
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  generate(
    _dto: GenerateDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<GenerateDocumentResponseDto> {
    throw new NotImplementedException(
      this.i18n.t(I18nKeys.GENERATION_NOT_IMPLEMENTED),
    );
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  findAll(
    _query: ListDocumentsQueryDto,
    _user: AuthenticatedUser,
  ): Promise<DocumentListResponseDto> {
    throw new NotImplementedException(
      this.i18n.t(I18nKeys.LISTING_NOT_IMPLEMENTED),
    );
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  findOne(_id: string, _user: AuthenticatedUser): Promise<DocumentResponseDto> {
    throw new NotImplementedException(
      this.i18n.t(I18nKeys.RETRIEVAL_NOT_IMPLEMENTED),
    );
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  remove(
    _id: string,
    _user: AuthenticatedUser,
  ): Promise<DeleteDocumentResponseDto> {
    throw new NotImplementedException(
      this.i18n.t(I18nKeys.DELETION_NOT_IMPLEMENTED),
    );
  }
}
