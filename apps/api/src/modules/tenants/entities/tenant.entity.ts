export interface Tenant {
  id: string;
  is_active: boolean;
  parent_tenant_id?: string | null;

  // Group 1: Organization Identity
  name?: string | null;
  slug?: string | null;
  logo_url?: string | null;

  // Group 2: Contact Information
  contact_email?: string | null;
  billing_email?: string | null;
  contact_phone?: string | null;

  // Group 3: Location (UAE-Specific)
  emirate?: string | null;
  city?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  postal_code?: string | null;

  // Group 4: Business Registration
  trade_license_number?: string | null;
  legal_entity_type?: string | null;
  tax_registration_number?: string | null;

  // Group 5: Settings & Preferences
  locale: string;
  timezone: string;
  default_jurisdiction?: string | null;
  settings: Record<string, unknown>;

  // Group 6: Branding
  brand_color_primary?: string | null;
  brand_color_secondary?: string | null;

  // Group 7: Lifecycle & Deactivation
  deactivated_at?: Date | null;
  deactivation_reason?: string | null;

  // Group 8: Onboarding Tracking
  onboarding_completed_at?: Date | null;
  onboarding_metadata: Record<string, unknown>;

  created_at: Date;
  updated_at: Date;
}
