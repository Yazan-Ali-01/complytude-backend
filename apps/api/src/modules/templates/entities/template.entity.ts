import { TemplateVersion } from './template-version.entity';

export interface Template {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category_id: string | null;
  authority_id: string | null;
  languages: string[];
  current_version: string;
  status: 'active' | 'inactive' | 'draft' | 'deprecated';
  tier: 'essential' | 'full';
  file_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateWithDetails extends Template {
  category: {
    id: string;
    code: string;
    name: string;
  } | null;
  authority: {
    id: string;
    code: string;
    name: string;
  } | null;
  rulesets:
    | {
        id: string;
        key: string;
        name: string;
      }[]
    | null;
  current_version_details: TemplateVersion | null;
}
