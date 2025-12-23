export interface DocumentMetadata {
  size?: number;
  contentType?: string;
  filename?: string;
  variables?: Record<string, any>;
  generatedAt?: string;
  templateId?: string;
  templateKey?: string;
  [key: string]: any; // Allow additional metadata fields
}

export interface Document {
  id: string;
  tenant_id: string;
  title: string;
  content?: string;
  metadata: DocumentMetadata;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}
