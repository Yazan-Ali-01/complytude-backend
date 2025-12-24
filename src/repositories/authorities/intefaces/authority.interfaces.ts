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

export type CreateAuthorityInput = {
  code: string;
  name: string;
  description?: string;
  country?: string;
  is_active?: boolean;
};

export type UpdateAuthorityInput = Partial<{
  name: string;
  description: string;
  country: string;
  is_active: boolean;
  updated_at: Date;
}>;
