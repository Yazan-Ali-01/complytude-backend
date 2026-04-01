import { DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';

export interface CreateGeneratedDocumentParams {
  tenantId: string;
  title: string;
  s3Key: string;
  s3Bucket: string;
  originalFilename: string;
  fileSizeBytes: number;
  mimeType: string;
  templateId: string;
  templateVersionId: string;
  generationVariables: Record<string, unknown>;
  createdBy: string;
}

export interface CreatedDocument {
  id: string;
}

@Injectable()
export class DocumentWriteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createGenerated(
    params: CreateGeneratedDocumentParams,
  ): Promise<CreatedDocument> {
    const result = await this.databaseService.query<{ id: string }>(
      `INSERT INTO public.documents (
        tenant_id, title, source_type, s3_key, s3_bucket,
        original_filename, file_size_bytes, mime_type,
        template_id, template_version_id, generation_variables,
        created_by, metadata
      ) VALUES ($1, $2, 'generated', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, '{}'::jsonb)
      RETURNING id`,
      [
        params.tenantId,
        params.title,
        params.s3Key,
        params.s3Bucket,
        params.originalFilename,
        params.fileSizeBytes,
        params.mimeType,
        params.templateId,
        params.templateVersionId,
        JSON.stringify(params.generationVariables),
        params.createdBy,
      ],
    );
    return { id: result.rows[0].id };
  }
}
