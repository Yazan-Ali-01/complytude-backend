export interface DocumentMetadata {
  size?: number;
  contentType?: string;
  filename?: string;
}

export interface DocumentGenerationMetadata {
  variables: Record<string, any>;
  generatedAt: string;
}

export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content: string | null;
  template_key: string | null;
  template_version: string | null;
  metadata: DocumentMetadata;
  generation_metadata: DocumentGenerationMetadata | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}
