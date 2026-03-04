import { DatabaseService } from '@lib/database';
import { AI_JOB_NAMES, QUEUE_NAMES, QueueProducerService } from '@lib/queue';
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import { DocumentRepository } from 'src/repositories/documents/document.repository';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import type {
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
   * @deprecated stub — will be implemented in a later ticket
   */
  preview(
    _dto: PreviewDocumentDto,
    _user: AuthenticatedUser,
  ): Promise<PreviewDocumentResponseDto> {
    throw new NotImplementedException(
      'Document preview generation not yet implemented',
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
      'Document generation not yet implemented',
    );
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  findAll(
    _query: ListDocumentsQueryDto,
    _user: AuthenticatedUser,
  ): Promise<DocumentListResponseDto> {
    throw new NotImplementedException('Document listing not yet implemented');
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  findOne(_id: string, _user: AuthenticatedUser): Promise<DocumentResponseDto> {
    throw new NotImplementedException('Document retrieval not yet implemented');
  }

  /**
   * @deprecated stub — will be implemented in a later ticket
   */
  remove(
    _id: string,
    _user: AuthenticatedUser,
  ): Promise<DeleteDocumentResponseDto> {
    throw new NotImplementedException('Document deletion not yet implemented');
  }
}
