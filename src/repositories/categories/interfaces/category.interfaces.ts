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

export type CreateCategoryInput = {
  code: string;
  name: string;
  description?: string;
  parent_id?: string;
  is_active?: boolean;
};

export type UpdateCategoryInput = Partial<{
  name: string;
  description: string;
  parent_id: string;
  is_active: boolean;
  updated_at: Date;
}>;
