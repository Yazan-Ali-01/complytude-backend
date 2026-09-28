import { DatabaseService } from '@lib/database';
import { DocxRendererService } from '@lib/docx-renderer';
import { PdfConversionService } from '@lib/pdf';
import type { DocumentGenerationJobData } from '@lib/queue';
import {
  ENTITLEMENT_JOB_NAMES,
  PermanentError,
  QUEUE_NAMES,
  QueueProducerService,
} from '@lib/queue';
import { S3Service } from '@lib/storage';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentWriteRepository } from '../repositories/document-write.repository';
import { GenerationJobWriteRepository } from '../repositories/generation-job-write.repository';

const PREVIEW_SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour
const PREVIEW_WATERMARK_TEXT = 'PREVIEW';

@Injectable()
export class DocumentGenerationWorkerService {
  private readonly logger = new Logger(DocumentGenerationWorkerService.name);
  private readonly templatesBucket: string;
  private readonly filesBucket: string;

  constructor(
    private readonly docxRenderer: DocxRendererService,
    private readonly pdfConversion: PdfConversionService,
    private readonly s3: S3Service,
    private readonly generationJobRepo: GenerationJobWriteRepository,
    private readonly documentWriteRepo: DocumentWriteRepository,
    private readonly configService: ConfigService,
    private readonly queueProducer: QueueProducerService,
    private readonly databaseService: DatabaseService,
  ) {
    this.templatesBucket =
      this.configService.get<string>('storage.buckets.templatesBucketName') ??
      'complytude-templates';
    this.filesBucket =
      this.configService.get<string>('storage.buckets.filesBucketName') ??
      'complytude-files';
  }

  async generate(
    data: DocumentGenerationJobData,
    attempt: number,
    maxAttempts: number,
  ): Promise<void> {
    const { generationJobId, jobType } = data;
    const isFinalAttempt = attempt >= maxAttempts;

    this.logger.log(
      `Processing generation job [${jobType}] generationJobId=${generationJobId} templateId=${data.templateId} tenantId=${data.tenantId} attempt=${attempt}/${maxAttempts}`,
    );

    const existingJob = await this.generationJobRepo.findById(generationJobId);
    if (!existingJob) {
      throw new PermanentError(
        `Generation job ${generationJobId} not found in database`,
      );
    }
    if (existingJob.status === 'completed') {
      this.logger.warn(`Skipping job ${generationJobId} — already completed`);
      return;
    }
    // Only skip failed if this is NOT a retry — a failed job that BullMQ is
    // retrying was marked failed too early on a previous attempt, so we reset
    // it back to processing and try again.
    if (existingJob.status === 'failed' && attempt === 1) {
      this.logger.warn(
        `Skipping job ${generationJobId} — already failed (not a BullMQ retry)`,
      );
      return;
    }

    const claimed =
      await this.generationJobRepo.markProcessing(generationJobId);
    if (!claimed) {
      this.logger.warn(
        `Could not claim job ${generationJobId} — another worker may have it`,
      );
      return;
    }

    try {
      if (jobType === 'preview') {
        await this.handlePreview(data);
      } else {
        await this.handleGenerate(data);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const permanent = this.isPermanentError(error);

      // Only write failed status on the last attempt or for permanent errors.
      // For transient retryable errors on intermediate attempts, leave status
      // as 'processing' so the next BullMQ retry can claim it.
      if (isFinalAttempt || permanent) {
        await this.generationJobRepo
          .markFailed(generationJobId, errorMessage)
          .catch((e: unknown) =>
            this.logger.error(
              `Failed to mark job ${generationJobId} as failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );

        if (jobType === 'generate') {
          await this.emitUsageRefund(data);
        }
      }

      if (permanent) {
        throw new PermanentError(errorMessage, error as Error);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Preview flow
  // ---------------------------------------------------------------------------

  private async handlePreview(data: DocumentGenerationJobData): Promise<void> {
    const { generationJobId, templateId, templateVersion, variables } = data;

    const templateBuffer = await this.fetchTemplateDocx(
      templateId,
      templateVersion,
    );
    const renderedDocx = this.renderDocx(templateBuffer, variables);
    const pdfBuffer = await this.pdfConversion.convertDocxToPdf(renderedDocx);
    const watermarkedPdf = await this.pdfConversion.addWatermark(
      pdfBuffer,
      PREVIEW_WATERMARK_TEXT,
    );

    const previewKey = `previews/${generationJobId}.pdf`;
    await this.s3.putObject(
      this.templatesBucket,
      previewKey,
      watermarkedPdf,
      'application/pdf',
    );

    const previewUrl = await this.s3.getSignedGetUrl(
      this.templatesBucket,
      previewKey,
      PREVIEW_SIGNED_URL_EXPIRY_SECONDS,
    );

    const expiresAt = new Date(
      Date.now() + PREVIEW_SIGNED_URL_EXPIRY_SECONDS * 1000,
    ).toISOString();

    await this.generationJobRepo.markCompleted(generationJobId, {
      previewUrl,
      expiresAt,
      s3Key: previewKey,
    });

    this.logger.log(
      `Preview completed: generationJobId=${generationJobId} s3Key=${previewKey}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Generate flow
  // ---------------------------------------------------------------------------

  private async handleGenerate(data: DocumentGenerationJobData): Promise<void> {
    const {
      generationJobId,
      templateId,
      templateVersionId,
      templateVersion,
      variables,
      tenantId,
      userId,
    } = data;

    const templateBuffer = await this.fetchTemplateDocx(
      templateId,
      templateVersion,
    );
    const renderedDocx = this.renderDocx(templateBuffer, variables);
    const pdfBuffer = await this.pdfConversion.convertDocxToPdf(renderedDocx);

    const title = await this.buildDocumentTitle(templateId, variables);
    // One job makes one document: a retry reuses the ID and S3 key, so it overwrites its own
    // PDF and finds its own row instead of creating a second one
    const documentId = generationJobId;
    const s3Key = `tenants/${tenantId}/documents/${documentId}/contract.pdf`;

    await this.s3.putObject(
      this.filesBucket,
      s3Key,
      pdfBuffer,
      'application/pdf',
    );

    await this.databaseService.transactionWithPlatformAdminContext(
      async (client) => {
        await this.documentWriteRepo.createGenerated(
          {
            id: documentId,
            tenantId,
            title,
            s3Key,
            s3Bucket: this.filesBucket,
            originalFilename: 'contract.pdf',
            fileSizeBytes: pdfBuffer.length,
            mimeType: 'application/pdf',
            templateId,
            templateVersionId,
            generationVariables: variables,
            createdBy: userId,
          },
          client,
        );
        await this.generationJobRepo.linkDocumentToJob(
          generationJobId,
          documentId,
          client,
        );
        await this.generationJobRepo.markCompleted(
          generationJobId,
          { documentId, s3Key, fileSize: pdfBuffer.length },
          client,
        );
      },
    );

    this.logger.log(
      `Generate completed: generationJobId=${generationJobId} documentId=${documentId} s3Key=${s3Key}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async fetchTemplateDocx(
    templateId: string,
    templateVersion: string,
  ): Promise<Buffer> {
    const s3Key = `templates/${templateId}/${templateVersion}/template.docx`;
    try {
      return await this.s3.getObjectBuffer(this.templatesBucket, s3Key);
    } catch (error) {
      throw new PermanentError(
        `Template DOCX not found: ${s3Key}`,
        error as Error,
      );
    }
  }

  private renderDocx(
    templateBuffer: Buffer,
    variables: Record<string, unknown>,
  ): Buffer {
    try {
      return this.docxRenderer.renderBuffer(templateBuffer, variables);
    } catch (error) {
      throw new PermanentError(
        `DOCX rendering failed: ${error instanceof Error ? error.message : String(error)}`,
        error as Error,
      );
    }
  }

  private async buildDocumentTitle(
    templateId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const templateName =
      await this.generationJobRepo.getTemplateName(templateId);
    const baseName = templateName ?? 'Document';

    const primaryVar = this.extractPrimaryVariable(variables);
    const datePart = new Date().toISOString().split('T')[0];

    return primaryVar
      ? `${baseName} — ${primaryVar}`
      : `${baseName} — ${datePart}`;
  }

  /**
   * Heuristic: pick the first short string variable as the "primary" identifier
   * for the document title (e.g. company name, contract number).
   */
  private extractPrimaryVariable(
    variables: Record<string, unknown>,
  ): string | null {
    const SYSTEM_VARS = new Set([
      'generated_date',
      'generated_date_formatted',
      'tenant_name',
      'tenant_trade_license_number',
      'user_full_name',
      'user_email',
    ]);

    for (const [key, value] of Object.entries(variables)) {
      if (SYSTEM_VARS.has(key)) continue;
      if (typeof value === 'string' && value.length > 0 && value.length <= 80) {
        return value;
      }
    }
    return null;
  }

  /**
   * Enqueue a USAGE_REFUND job so the API can void the usage_ledger entry and
   * rebuild the aggregated_usage projection, giving the tenant their quota back.
   *
   * Failures here are non-fatal — we log the error and continue so BullMQ can
   * still mark the generation job as failed. The refund can be re-triggered
   * manually if needed.
   */
  private async emitUsageRefund(
    data: DocumentGenerationJobData,
  ): Promise<void> {
    try {
      await this.queueProducer.enqueue(
        QUEUE_NAMES.ENTITLEMENT_PROCESSING,
        ENTITLEMENT_JOB_NAMES.USAGE_REFUND,
        {
          tenantId: data.tenantId,
          resourceId: data.generationJobId,
          resourceType: 'generation_job',
          featureKey: 'documents_per_month',
          units: 1,
        },
        { jobId: `usage-refund-${data.generationJobId}` },
      );
      this.logger.log(
        `Enqueued USAGE_REFUND for failed generate job ${data.generationJobId} tenant=${data.tenantId}`,
      );
    } catch (refundError) {
      this.logger.error(
        `Failed to enqueue USAGE_REFUND for job ${data.generationJobId} tenant=${data.tenantId}: ${refundError instanceof Error ? refundError.message : String(refundError)}`,
      );
    }
  }

  private isPermanentError(error: unknown): boolean {
    if (error instanceof PermanentError) return true;
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('corrupt') ||
      message.includes('not a valid DOCX') ||
      message.includes('rendering failed') ||
      message.includes('not found')
    );
  }
}
