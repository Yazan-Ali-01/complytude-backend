/**
 * Validation error detail returned in API response
 */
export interface ValidationDetail {
  field: string;
  rule: string;
  message: string;
  received: string;
  expected: string;
}

/**
 * Context object provided by class-validator for constraint information
 */
export interface ValidationRuleContext {
  constraint?: unknown;
  [key: string]: unknown;
}
