import {
  Addon,
  AddonEntitlement,
  TenantAddonWithEntitlements,
  TenantOverride,
} from 'src/common/types/entitlement.types';
import { AddonWithEntitlements } from '../../../repositories/entitlements/addons.repository';
import {
  AddonCatalogDetailResponseDto,
  AddonCatalogResponseDto,
  AddonEntitlementDto,
} from '../dto/addon-catalog.dto';
import {
  TenantAddonEntitlementDto,
  TenantAddonResponseDto,
} from '../dto/tenant-addon.dto';
import { OverrideResponseDto } from '../dto/tenant-override.dto';

/**
 * Shared mapper utilities for entitlement DTOs
 * Eliminates duplication across controllers
 */

export function mapAddonEntitlementToDto(
  entitlement: AddonEntitlement,
): TenantAddonEntitlementDto {
  return {
    featureKey: entitlement.feature_key,
    featureType: entitlement.feature_type,
    valueBool: entitlement.value_bool,
    valueInt: entitlement.value_int,
    valueText: entitlement.value_text,
  };
}

export function mapTenantAddonToDto(
  addon: TenantAddonWithEntitlements,
  addonName?: string,
): TenantAddonResponseDto {
  return {
    id: addon.id,
    addonKey: addon.addon_key || addon.addon_id,
    addonName: addonName || 'Add-on',
    quantity: addon.quantity,
    status: addon.status,
    startsAt: addon.starts_at,
    expiresAt: addon.expires_at,
    entitlements: addon.entitlements.map(mapAddonEntitlementToDto),
    createdAt: addon.created_at,
    updatedAt: addon.updated_at,
  };
}

export function mapOverrideToDto(
  override: TenantOverride,
): OverrideResponseDto {
  return {
    id: override.id,
    featureKey: override.feature_key,
    featureType: override.feature_type,
    valueBool: override.value_bool,
    valueInt: override.value_int,
    valueText: override.value_text,
    reason: override.reason,
    appliedBy: override.applied_by,
    startsAt: override.starts_at,
    expiresAt: override.expires_at,
    isActive: override.is_active,
    createdAt: override.created_at,
    updatedAt: override.updated_at,
  };
}

/**
 * Map addon catalog entitlement to DTO
 */
function mapCatalogEntitlementToDto(
  entitlement: AddonEntitlement,
): AddonEntitlementDto {
  return {
    featureKey: entitlement.feature_key,
    featureType: entitlement.feature_type,
    valueBool: entitlement.value_bool,
    valueInt: entitlement.value_int,
    valueText: entitlement.value_text,
  };
}

/**
 * Map addon to catalog list DTO
 */
export function mapAddonToCatalogDto(addon: Addon): AddonCatalogResponseDto {
  return {
    id: addon.id,
    key: addon.key,
    name: addon.name,
    description: addon.description,
    priceMonthly: addon.price_monthly,
    priceCurrency: addon.price_currency,
    isActive: addon.is_active,
  };
}

/**
 * Map addon with entitlements to catalog detail DTO
 */
export function mapAddonToCatalogDetailDto(
  addon: AddonWithEntitlements,
): AddonCatalogDetailResponseDto {
  return {
    id: addon.id,
    key: addon.key,
    name: addon.name,
    description: addon.description,
    priceMonthly: addon.price_monthly,
    priceCurrency: addon.price_currency,
    isActive: addon.is_active,
    entitlements: addon.entitlements.map(mapCatalogEntitlementToDto),
  };
}
