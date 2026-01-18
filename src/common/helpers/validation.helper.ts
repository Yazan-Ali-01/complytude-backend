import { BadRequestException } from '@nestjs/common';

/**
 * Validation helper for database identifiers to prevent SQL injection
 */
export class ValidationHelper {
  /**
   * Validate tenant ID format
   * Tenant IDs should match the pattern: tenant_<uuid> or a similar safe format
   * @param tenantId Tenant identifier to validate
   * @throws BadRequestException if validation fails
   */
  static validateTenantId(tenantId: string): void {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new BadRequestException(
        'Tenant ID is required and must be a string',
      );
    }

    if (tenantId.trim() === '') {
      throw new BadRequestException('Tenant ID cannot be empty');
    }

    // Allow tenant IDs with alphanumeric, hyphens, and underscores
    // Common patterns: tenant_uuid, tenant_123, etc.
    const tenantIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!tenantIdPattern.test(tenantId)) {
      throw new BadRequestException(
        'Invalid tenant ID format. Only alphanumeric characters, hyphens, and underscores are allowed',
      );
    }

    // Prevent excessively long tenant IDs (potential DoS)
    if (tenantId.length > 255) {
      throw new BadRequestException(
        'Tenant ID exceeds maximum length of 255 characters',
      );
    }
  }

  /**
   * Validate schema name format
   * Schema names should match the pattern: tenant_<identifier>
   * @param schemaName Schema name to validate
   * @throws BadRequestException if validation fails
   */
  static validateSchemaName(schemaName: string): void {
    if (!schemaName || typeof schemaName !== 'string') {
      throw new BadRequestException(
        'Schema name is required and must be a string',
      );
    }

    if (schemaName.trim() === '') {
      throw new BadRequestException('Schema name cannot be empty');
    }

    // Schema names must match tenant pattern and contain only lowercase alphanumeric and underscores
    const schemaNamePattern = /^tenant_[a-z0-9_]+$/;
    if (!schemaNamePattern.test(schemaName)) {
      throw new BadRequestException(
        'Invalid schema name format. Must match pattern: tenant_<identifier> with lowercase alphanumeric and underscores only',
      );
    }

    // Prevent excessively long schema names (PostgreSQL limit is 63 characters)
    if (schemaName.length > 63) {
      throw new BadRequestException(
        'Schema name exceeds PostgreSQL maximum length of 63 characters',
      );
    }

    // Prevent reserved schema names
    const reservedSchemas = [
      'public',
      'pg_catalog',
      'information_schema',
      'pg_toast',
    ];
    if (reservedSchemas.includes(schemaName.toLowerCase())) {
      throw new BadRequestException(
        `Schema name "${schemaName}" is reserved and cannot be used`,
      );
    }
  }

  /**
   * Validate both tenant ID and schema name
   * @param tenantId Tenant identifier to validate
   * @param schemaName Schema name to validate
   * @throws BadRequestException if validation fails
   */
  static validateTenantContext(tenantId: string, schemaName: string): void {
    this.validateTenantId(tenantId);
    this.validateSchemaName(schemaName);
  }
}
