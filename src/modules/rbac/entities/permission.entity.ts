export interface Permission {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string;
  is_active: boolean;
  created_at: Date;
}
