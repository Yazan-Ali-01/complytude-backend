export interface FeatureOverride {
  id: string;
  tenantId: string;
  featureKey: string;
  value: unknown;
  grantedBy: string | null;
  grantedAt: Date;
  reason: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOverrideInput {
  featureKey: string;
  value: unknown;
  reason?: string;
  expiresAt?: Date | null;
}

export interface BulkCreateOverrideInput {
  overrides: CreateOverrideInput[];
  reason?: string;
}

export interface FeatureOverrideRow {
  id: string;
  tenant_id: string;
  feature_key: string;
  value: unknown;
  granted_by: string | null;
  granted_at: Date;
  reason: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export function mapOverrideRow(row: FeatureOverrideRow): FeatureOverride {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    featureKey: row.feature_key,
    value: row.value,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
    reason: row.reason,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
