export interface TemplateField {
  key: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'date'
    | 'boolean'
    | 'select'
    | 'textarea'
    | 'email'
    | 'phone';
  required: boolean;
  default_value?: unknown;
  placeholder?: string;
  help_text?: string;
  validation_rules?: {
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  };
  options?: string[] | { label: string; value: string }[];
  order?: number;
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: string;
  fields: TemplateField[];
  file_url: string;
  changelog?: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_by?: string;
  created_at: Date;
}

export type CreateTemplateVersionInput = {
  template_id: string;
  version: string;
  fields: TemplateField[];
  file_url: string;
  changelog?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  created_by?: string;
};
