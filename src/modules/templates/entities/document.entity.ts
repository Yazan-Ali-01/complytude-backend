export interface DocumentMetadata {
  size?: number;
  contentType?: string;
  filename?: string;
}

export interface DocumentGenerationMetadata {
  variables?: Record<string, any>;
  generatedAt?: string;
  templateId?: string;
  templateKey?: string;
}

export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content?: string;
  template_key?: string;
  metadata: DocumentMetadata;
  generation_metadata: DocumentGenerationMetadata;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}
