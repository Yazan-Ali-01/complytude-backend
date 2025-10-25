export interface Category {
  id: string;
  code: string;
  name: string;
  description?: string;
  parent_id?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
