import { DatabaseService } from '@lib/database';
import {
  AI_JOB_NAMES,
  INGESTION_JOB_NAMES,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AnalysisJobRepository } from 'src/repositories/analysis-jobs/analysis-job.repository';
import {
  Document,
  DocumentRepository,
} from 'src/repositories/documents/document.repository';
import type { AuthenticatedTenantUser } from '../auth/strategies';
import { StorageService } from '../storage/storage.service';
import { DocumentsI18n } from './constants/i18n.constants';
import { UPLOAD_MAX_FILE_SIZE_BYTES } from './constants/upload.constants';
import type {
  AnalysisJobResponseDto,
  AnalyzeDocumentDto,
  AnalyzeDocumentResponseDto,
  ConfirmUploadResponseDto,
  DeleteDocumentResponseDto,
  DocumentListResponseDto,
  DocumentResponseDto,
  DocumentSummaryDto,
  ListDocumentsQueryDto,
  UploadUrlDto,
  UploadUrlResponseDto,
} from './dto';

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
  ) {}

  async analyze(
    dto: AnalyzeDocumentDto,
    user: AuthenticatedTenantUser,
  ): Promise<AnalyzeDocumentResponseDto> {
    try {
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
                metadata: JSON.stringify({}),
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

    const sanitizedFilename = this.storageService.normalizeFileName(
      dto.filename,
    );

    const documentId = crypto.randomUUID();
    const s3Key = `tenants/${user.tenantId}/documents/${documentId}/${sanitizedFilename}`;

    try {
      await this.databaseService.transactionWithTenantContext(
        { tenantId: user.tenantId },
        async (client) => {
          await this.documentRepository.createWithId(
            documentId,
            {
              tenant_id: user.tenantId,
              title: dto.filename,
              created_by: user.userId,
              metadata: JSON.stringify({}),
              source_type: 'file_upload',
              s3_key: s3Key,
              s3_bucket: quarantineBucket,
              original_filename: sanitizedFilename,
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
      const existing = await this.documentRepository.findById(documentId, {
        tenant: tenantContext,
      });
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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `confirmUpload failed: documentId=${documentId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.UPLOAD_URL_GENERATION_FAILED),
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

      const document = await this.documentRepository.findById(documentId, {
        tenant: tenantContext,
      });
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

      return this.mapAnalysisJobToDto(job);
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
      if (!job) {
        throw new NotFoundException(
          this.i18n.t(DocumentsI18n.errors.ANALYSIS_JOB_NOT_FOUND),
        );
      }

      return this.mapAnalysisJobToDto(job);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `getAnalysisJobById failed: analysisJobId=${analysisJobId} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
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

      const document = await this.documentRepository.findById(id, {
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

  async remove(
    id: string,
    user: AuthenticatedTenantUser,
  ): Promise<DeleteDocumentResponseDto> {
    const tenantContext = {
      tenantId: user.tenantId,
      schema: 'public' as const,
    };

    const document = await this.documentRepository.findById(id, {
      tenant: tenantContext,
    });

    if (!document) {
      throw new NotFoundException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_NOT_FOUND),
      );
    }

    try {
      await this.documentRepository.delete(id, { tenant: tenantContext });
    } catch (error) {
      this.logger.error(
        `remove DB delete failed: documentId=${id} tenantId=${user.tenantId} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        this.i18n.t(DocumentsI18n.errors.DOCUMENT_DELETE_FAILED),
      );
    }

    if (document.s3_key && document.s3_bucket) {
      try {
        await this.storageService.deleteObjectFromBucket(
          document.s3_bucket,
          document.s3_key,
        );
      } catch (error) {
        this.logger.error(
          `S3 cleanup failed (document already deleted from DB): documentId=${id} bucket=${document.s3_bucket} key=${document.s3_key} - ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Document deleted: documentId=${id} tenantId=${user.tenantId} userId=${user.userId}`,
    );

    return {
      id,
      message: this.i18n.t(DocumentsI18n.messages.DOCUMENT_DELETED),
      deletedAt: new Date().toISOString(),
    };
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
      metadata: doc.metadata,
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
