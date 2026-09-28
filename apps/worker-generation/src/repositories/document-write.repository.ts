import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface CreateGeneratedDocumentParams {
  id: string;
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

/**
 * documents has RLS with FORCE ROW LEVEL SECURITY.
 * worker-generation has no tenant context, so every query runs in a
 * transactionWithPlatformAdminContext to satisfy the is_platform_admin() policy.
 */
@Injectable()
export class DocumentWriteRepository {
  /**
   * Creates the generated document, or does nothing if a previous attempt already created it
   * (the ID is derived from the generation job). Runs in the caller's platform-admin transaction.
   */
  async createGenerated(
    params: CreateGeneratedDocumentParams,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO public.documents (
        id, tenant_id, title, source_type, s3_key, s3_bucket,
        original_filename, file_size_bytes, mime_type,
        template_id, template_version_id, generation_variables,
        created_by
      ) VALUES ($1, $2, $3, 'generated', $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      ON CONFLICT (id) DO NOTHING`,
      [
        params.id,
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
  }
}
