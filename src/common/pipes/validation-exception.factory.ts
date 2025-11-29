import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * Validation rule names used by class-validator
 */
const VALIDATION_RULES = {
  MAX_LENGTH: 'maxLength',
  MIN_LENGTH: 'minLength',
  MIN: 'min',
  MAX: 'max',
  MIN_DATE: 'minDate',
  MAX_DATE: 'maxDate',
  IS_INT: 'isInt',
  IS_NUMBER: 'isNumber',
  IS_DECIMAL: 'isDecimal',
  IS_POSITIVE: 'isPositive',
  IS_NEGATIVE: 'isNegative',
  IS_EMAIL: 'isEmail',
  IS_DATE: 'isDate',
  IS_BOOLEAN: 'isBoolean',
  IS_ENUM: 'isEnum',
  IS_STRING: 'isString',
  IS_NOT_EMPTY: 'isNotEmpty',
  IS_ARRAY: 'isArray',
  IS_OBJECT: 'isObject',
  IS_UUID: 'isUUID',
  IS_IN: 'isIn',
  MATCHES: 'matches',
  ARRAY_MIN_SIZE: 'arrayMinSize',
  ARRAY_MAX_SIZE: 'arrayMaxSize',
  WHITELIST_VALIDATION: 'whitelistValidation',
  IS_DEFINED: 'isDefined',
} as const;

type ValidationRule = typeof VALIDATION_RULES[keyof typeof VALIDATION_RULES] | string;

/**
 * Context object provided by class-validator for constraint information
 */
interface ValidationRuleContext {
  constraint?: unknown;
  [key: string]: unknown;
}

/**
 * Validation error detail returned in API response
 */
interface ValidationDetail {
  field: string;
  rule: string;
  message: string;
  received: string;
  expected: string;
}

/**
 * Extracts constraint value from error message using regex patterns
 * Used as fallback when ValidationError.contexts is not available
 * @param rule - The validation rule name
 * @param message - The error message
 * @returns Extracted constraint value or undefined
 */
function extractConstraintFromMessage(rule: string, message: string): unknown {
  if (!message) return undefined;

  // Pattern for maxLength: "must be shorter than or equal to 50 characters"
  if (rule === VALIDATION_RULES.MAX_LENGTH) {
    const match = message.match(/(?:shorter than or equal to|at most) (\d+)/i);
    if (match) return Number(match[1]);
  }

  // Pattern for minLength: "must be longer than or equal to 8 characters"
  if (rule === VALIDATION_RULES.MIN_LENGTH) {
    const match = message.match(/(?:longer than or equal to|at least) (\d+)/i);
    if (match) return Number(match[1]);
  }

  // Pattern for arrayMinSize: "must contain at least 1 elements"
  if (rule === VALIDATION_RULES.ARRAY_MIN_SIZE) {
    const match = message.match(/at least (\d+)/i);
    if (match) return Number(match[1]);
  }

  // Pattern for arrayMaxSize: "must contain not more than X elements"
  if (rule === VALIDATION_RULES.ARRAY_MAX_SIZE) {
    const match = message.match(/not more than (\d+)/i);
    if (match) return Number(match[1]);
  }

  // Generic number extraction for min/max
  const numberMatch = message.match(/(?:must be|at least|at most|greater than|less than|equal to) (\d+(?:\.\d+)?)/i);
  if (numberMatch) return Number(numberMatch[1]);

  return undefined;
}

/**
 * Computes the expected value description for a validation rule
 * @param rule - The validation rule name
 * @param constraintValue - The constraint value from the validation context
 * @param message - The error message (used as fallback for constraint extraction)
 * @returns A human-readable description of what was expected
 */
function computeExpected(
  rule: string,
  constraintValue: unknown,
  message?: string,
): string {
  // If constraint value not available, try to extract from message
  if (constraintValue === undefined && message) {
    constraintValue = extractConstraintFromMessage(rule, message);
  }

  switch (rule) {
    case VALIDATION_RULES.MAX_LENGTH:
      return constraintValue ? `at most ${constraintValue} characters` : '';
    case VALIDATION_RULES.MIN_LENGTH:
      return constraintValue ? `at least ${constraintValue} characters` : '';
    case VALIDATION_RULES.IS_INT:
      return 'integer';
    case VALIDATION_RULES.IS_NUMBER:
      return 'number';
    case VALIDATION_RULES.IS_DECIMAL:
      return 'decimal number';
    case VALIDATION_RULES.IS_POSITIVE:
      return 'positive number';
    case VALIDATION_RULES.IS_NEGATIVE:
      return 'negative number';
    case VALIDATION_RULES.MIN:
    case VALIDATION_RULES.MIN_DATE:
      return constraintValue ? `at least ${constraintValue}` : '';
    case VALIDATION_RULES.MAX:
    case VALIDATION_RULES.MAX_DATE:
      return constraintValue ? `at most ${constraintValue}` : '';
    case VALIDATION_RULES.IS_EMAIL:
      return 'valid email';
    case VALIDATION_RULES.IS_DATE:
      return 'valid date';
    case VALIDATION_RULES.IS_BOOLEAN:
      return 'boolean';
    case VALIDATION_RULES.IS_STRING:
      return 'string';
    case VALIDATION_RULES.IS_NOT_EMPTY:
      return 'non-empty value';
    case VALIDATION_RULES.IS_ARRAY:
      return 'array';
    case VALIDATION_RULES.IS_OBJECT:
      return 'object';
    case VALIDATION_RULES.IS_UUID:
      return 'valid UUID';
    case VALIDATION_RULES.IS_ENUM:
      if (!constraintValue) return '';
      if (Array.isArray(constraintValue)) {
        return `one of: ${constraintValue.join(', ')}`;
      }
      return `one of: ${String(constraintValue)}`;
    case VALIDATION_RULES.IS_IN:
      if (!constraintValue) return '';
      if (Array.isArray(constraintValue)) {
        return `one of: ${constraintValue.join(', ')}`;
      }
      return `one of: ${String(constraintValue)}`;
    case VALIDATION_RULES.MATCHES:
      if (constraintValue) {
        return `matching pattern: ${String(constraintValue)}`;
      }
      return 'matching pattern';
    case VALIDATION_RULES.ARRAY_MIN_SIZE:
      return constraintValue ? `at least ${constraintValue} items` : '';
    case VALIDATION_RULES.ARRAY_MAX_SIZE:
      return constraintValue ? `at most ${constraintValue} items` : '';
    case VALIDATION_RULES.WHITELIST_VALIDATION:
      return 'not present';
    case VALIDATION_RULES.IS_DEFINED:
      return 'present';
    default:
      // Fallback: try to extract constraint from message if context wasn't available
      if (message) {
        const match = message.match(
          /(less than or equal to|at most|at least|greater than or equal to) (\d+)/i,
        );
        if (match) {
          return `${match[1]} ${match[2]}`;
        }
      }
      return '';
  }
}

/**
 * Extracts constraint value from ValidationError context
 * @param contexts - The contexts object from ValidationError
 * @param rule - The validation rule name
 * @returns The constraint value if available, undefined otherwise
 */
function extractConstraintValue(
  contexts: Record<string, ValidationRuleContext> | undefined,
  rule: string,
): unknown {
  if (!contexts || typeof contexts !== 'object') {
    return undefined;
  }

  const context = contexts[rule];
  if (!context || typeof context !== 'object') {
    return undefined;
  }

  return context.constraint;
}

/**
 * Gets the received value string representation
 * @param value - The actual value that failed validation
 * @param rule - The validation rule name
 * @returns String representation of the received value
 */
function getReceivedValue(value: unknown, rule: string): string {
  if (rule === VALIDATION_RULES.WHITELIST_VALIDATION) {
    return 'present';
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

/**
 * Processes a single validation error and its children recursively
 * @param error - The validation error to process
 * @param parentPath - Optional parent field path for nested errors
 * @returns Array of validation details
 */
function processValidationError(
  error: ValidationError,
  parentPath?: string,
): ValidationDetail[] {
  const fieldPath = parentPath
    ? `${parentPath}.${error.property}`
    : error.property;
  const details: ValidationDetail[] = [];

  // Process direct constraints on this error
  if (error.constraints) {
    for (const [rule, message] of Object.entries(error.constraints)) {
      const constraintValue = extractConstraintValue(error.contexts, rule);
      const received = getReceivedValue(error.value, rule);
      const expected =
        rule === VALIDATION_RULES.WHITELIST_VALIDATION
          ? 'not present'
          : computeExpected(rule, constraintValue, message);

      details.push({
        field: fieldPath,
        rule,
        message: String(message),
        received,
        expected,
      });
    }
  }

  // Process nested children recursively
  if (error.children && error.children.length > 0) {
    for (const child of error.children) {
      details.push(...processValidationError(child, fieldPath));
    }
  }

  return details;
}

/**
 * Factory function that creates a BadRequestException from ValidationError array
 * Transforms class-validator errors into a structured API response format
 *
 * @param validationErrors - Array of ValidationError objects from class-validator
 * @returns BadRequestException with structured error details
 *
 * @example
 * ```typescript
 * app.useGlobalPipes(
 *   new ValidationPipe({
 *     exceptionFactory: validationExceptionFactory,
 *   }),
 * );
 * ```
 *
 * Response format:
 * ```json
 * {
 *   "statusCode": 400,
 *   "error": "Bad Request",
 *   "message": "Variable validation failed",
 *   "details": [
 *     {
 *       "field": "email",
 *       "rule": "isEmail",
 *       "message": "email must be an email",
 *       "received": "invalid-email",
 *       "expected": "valid email"
 *     }
 *   ]
 * }
 * ```
 */
export function validationExceptionFactory(
  validationErrors: ValidationError[] = [],
): BadRequestException {
  const details: ValidationDetail[] = validationErrors.flatMap((error) =>
    processValidationError(error),
  );

  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Variable validation failed',
    details,
  });
}
