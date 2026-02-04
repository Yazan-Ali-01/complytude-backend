import { SetMetadata } from '@nestjs/common';

/**
 * Metadata keys for audit decorators
 */
export const AUDIT_RESOURCE_KEY = 'audit:resource';
export const AUDIT_ACTION_KEY = 'audit:action';

/**
 * Audit action configuration
 * Supports both simple string actions and structured actions with sub-resources
 */
export interface AuditActionConfig {
  /**
   * The action name (e.g., 'create', 'update', 'delete', 'read', 'change_jurisdiction')
   */
  action: string;

  /**
   * Optional sub-resource for more specific actions
   * Example: { action: 'change', subResource: 'jurisdiction' } -> 'settings:change_jurisdiction'
   */
  subResource?: string;

  /**
   * Optional custom resource type override
   * If not provided, uses the controller-level @AuditResource() value
   */
  resourceType?: string;
}

/**
 * Controller-level decorator to define the audit resource type
 * This sets the default resource type for all endpoints in the controller
 *
 * @param resourceType - The resource type (e.g., 'documents', 'templates', 'settings')
 *
 * @example
 * ```typescript
 * @Controller('documents')
 * @AuditResource('documents')
 * export class DocumentsController {
 *   // All methods will use 'documents' as resource type by default
 * }
 * ```
 */
export const AuditResource = (resourceType: string) =>
  SetMetadata(AUDIT_RESOURCE_KEY, resourceType);

/**
 * Method-level decorator to define or override the audit action
 * Can be used with simple string or structured configuration
 *
 * @param config - Action configuration (string or AuditActionConfig)
 *
 * @example Simple action
 * ```typescript
 * @Post()
 * @AuditAction('create')
 * async create() {
 *   // Will log as 'documents:create'
 * }
 * ```
 *
 * @example Structured action with sub-resource
 * ```typescript
 * @Patch('jurisdiction')
 * @AuditAction({ action: 'change', subResource: 'jurisdiction' })
 * async changeJurisdiction() {
 *   // Will log as 'settings:change_jurisdiction'
 * }
 * ```
 *
 * @example Override resource type for specific endpoint
 * ```typescript
 * @Post('export')
 * @AuditAction({ action: 'export', resourceType: 'reports' })
 * async exportDocument() {
 *   // Will log as 'reports:export' instead of 'documents:export'
 * }
 * ```
 */
export const AuditAction = (config: string | AuditActionConfig) => {
  const normalizedConfig: AuditActionConfig =
    typeof config === 'string' ? { action: config } : config;

  return SetMetadata(AUDIT_ACTION_KEY, normalizedConfig);
};
