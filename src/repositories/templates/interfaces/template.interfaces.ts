export type TemplateStatus = 'active' | 'inactive' | 'draft' | 'deprecated';

export interface Template {
  id: string;
  key: string;
  name: string;
  description?: string;
  category_id?: string;
  authority_id?: string;
  languages: string[];
  current_version: string;
  status: TemplateStatus;
  file_url?: string;
  thumbnail_url?: string;
  metadata: Record<string, unknown>;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export type CreateTemplateInput = {
  key: string;
  name: string;
  description?: string;
  category_id?: string;
  authority_id?: string;
  languages: string[];
  current_version?: string;
  status?: TemplateStatus;
  file_url?: string;
  thumbnail_url?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
};

export type UpdateTemplateInput = Partial<{
  name: string;
  description: string;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: TemplateStatus;
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  updated_at: Date;
}>;

export type TemplateFilters = {
  status?: TemplateStatus;
  category_id?: string;
  authority_id?: string;
  languages?: string;
};

export type PaginationOptions = {
  offset?: number;
  limit?: number;
};

export type PaginatedTemplates = {
  data: Template[];
  total: number;
};
