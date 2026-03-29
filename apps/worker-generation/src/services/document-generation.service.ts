import { DocumentGenerationJobData } from '@lib/queue';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DocumentGenerationWorkerService {
  private readonly logger = new Logger(DocumentGenerationWorkerService.name);

  generate(data: DocumentGenerationJobData): Promise<void> {
    this.logger.log(
      `Processing generation job [${data.jobType}] generationJobId=${data.generationJobId} templateId=${data.templateId} tenantId=${data.tenantId}`,
    );

    // TODO(COM-229): implement full generation pipeline
    // 1. Load template version + DOCX from S3
    // 2. Render DOCX with provided variables (docxtemplater)
    // 3. Convert to PDF via Gotenberg (if jobType === 'generate')
    // 4. Upload result to S3
    // 5. Update generation_jobs table: status → completed, result_s3_key
    return Promise.reject(new Error('Not implemented — see COM-229'));
  }
}
