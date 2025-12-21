export interface Authority {
  id: string;
  code: string;
  name: string;
  description?: string;
  country: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
