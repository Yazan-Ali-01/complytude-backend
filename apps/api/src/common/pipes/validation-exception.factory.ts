import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  ValidationDetail,
  ValidationRuleContext,
} from 'src/common/types/validation.types';
import { ValidationException } from '../exceptions/validation.exception';
import { formatFileSize } from '../helper';

/**
 * Validation rule names used by class-validator
 * Extracted to a constant to avoid magic strings and to make it easier to maintain
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
  // Custom file validation rules (from src/common/decorators/file-validators.decorator.ts)
  IS_VALID_FILE: 'isValidFile',
  IS_FILE_UPLOADED: 'isFileUploaded',
  IS_FILE_MIME_TYPE: 'isFileMimeType',
  IS_FILE_MAX_SIZE: 'isFileMaxSize',
} as const;

interface FileLike {
  size?: unknown;
  mimetype?: unknown;
}

function safeToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Maps validation rule names (from class-validator, etc.) to human-readable
 * descriptions or expected value hints. Used to produce more user-friendly
 * error details in DTO validation responses.
 *
 * Keys correspond to VALIDATION_RULES, values are functions that return
 * string descriptions (optionally accepting a constraint value).
 */
const ruleDescriptions: Record<string, (constraintValue?: unknown) => string> =
  {
    [VALIDATION_RULES.IS_INT]: () => 'integer',
    [VALIDATION_RULES.IS_NUMBER]: () => 'number',
    [VALIDATION_RULES.IS_DECIMAL]: () => 'decimal number',
    [VALIDATION_RULES.IS_POSITIVE]: () => 'positive number',
    [VALIDATION_RULES.IS_NEGATIVE]: () => 'negative number',
    [VALIDATION_RULES.IS_EMAIL]: () => 'valid email',
    [VALIDATION_RULES.IS_DATE]: () => 'valid date',
    [VALIDATION_RULES.IS_BOOLEAN]: () => 'boolean',
    [VALIDATION_RULES.IS_STRING]: () => 'string',
    [VALIDATION_RULES.IS_NOT_EMPTY]: () => 'non-empty value',
    [VALIDATION_RULES.IS_ARRAY]: () => 'array',
    [VALIDATION_RULES.IS_OBJECT]: () => 'object',
    [VALIDATION_RULES.IS_UUID]: () => 'valid UUID',
    [VALIDATION_RULES.IS_DEFINED]: () => 'present',
    [VALIDATION_RULES.WHITELIST_VALIDATION]: () => 'not present',

    [VALIDATION_RULES.MAX_LENGTH]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at most ${n} characters`;
    },
    [VALIDATION_RULES.MIN_LENGTH]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at least ${n} characters`;
    },
    [VALIDATION_RULES.MIN]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at least ${n}`;
    },
    [VALIDATION_RULES.MIN_DATE]: (v) =>
      v ? `at least ${safeToString(v)}` : '',
    [VALIDATION_RULES.MAX]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at most ${n}`;
    },
    [VALIDATION_RULES.MAX_DATE]: (v) => (v ? `at most ${safeToString(v)}` : ''),
    [VALIDATION_RULES.ARRAY_MIN_SIZE]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at least ${n} items`;
    },
    [VALIDATION_RULES.ARRAY_MAX_SIZE]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined ? '' : `at most ${n} items`;
    },
    [VALIDATION_RULES.IS_ENUM]: (v) => {
      if (!v) return '';
      if (Array.isArray(v)) return `one of: ${v.map(String).join(', ')}`;
      return `one of: ${safeToString(v)}`;
    },
    [VALIDATION_RULES.IS_IN]: (v) => {
      if (!v) return '';
      if (Array.isArray(v)) return `one of: ${v.map(String).join(', ')}`;
      return `one of: ${safeToString(v)}`;
    },
    [VALIDATION_RULES.MATCHES]: (v) =>
      v ? `matching pattern: ${safeToString(v)}` : 'matching pattern',

    // Custom file validation descriptions
    [VALIDATION_RULES.IS_VALID_FILE]: () => 'a valid file',
    [VALIDATION_RULES.IS_FILE_UPLOADED]: () => 'a file',
    [VALIDATION_RULES.IS_FILE_MIME_TYPE]: (v) => {
      if (Array.isArray(v)) return `file type: ${v.map(String).join(', ')}`;
      return 'valid file type';
    },
    [VALIDATION_RULES.IS_FILE_MAX_SIZE]: (v) => {
      const n = typeof v === 'number' ? v : undefined;
      return n === undefined
        ? 'valid file size'
        : `at most ${formatFileSize(n)}`;
    },
  };

/**
 * Regex patterns for extracting constraint values from error messages
 * Used as fallback when ValidationError.contexts is not available
 * Maps validation rule names to regex patterns that extract numeric constraint values
 */
const CONSTRAINT_PATTERNS: Record<string, RegExp> = {
  [VALIDATION_RULES.MAX_LENGTH]: /(?:shorter than or equal to|at most) (\d+)/i,
  [VALIDATION_RULES.MIN_LENGTH]: /(?:longer than or equal to|at least) (\d+)/i,
  [VALIDATION_RULES.ARRAY_MIN_SIZE]: /at least (\d+)/i,
  [VALIDATION_RULES.ARRAY_MAX_SIZE]: /not more than (\d+)/i,
};

/**
 * Generic regex pattern for extracting numeric constraints from error messages
 * Used as fallback when no specific pattern matches
 */
const GENERIC_CONSTRAINT_PATTERN =
  /(?:must be|at least|at most|greater than|less than|equal to) (\d+(?:\.\d+)?)/i;

/**
 * Extracts constraint value from error message using regex patterns
 * Used as fallback when ValidationError.contexts is not available
 * @param rule - The validation rule name
 * @param message - The error message
 * @returns Extracted constraint value or undefined
 */
function extractConstraintFromMessage(rule: string, message: string): unknown {
  if (!message) return undefined;

  // Try rule-specific pattern first
  const pattern = CONSTRAINT_PATTERNS[rule];
  if (pattern) {
    const match = message.match(pattern);
    if (match) return Number(match[1]);
  }

  // Fallback to generic pattern for numeric constraints
  const genericMatch = message.match(GENERIC_CONSTRAINT_PATTERN);
  if (genericMatch) return Number(genericMatch[1]);

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

  const handler = ruleDescriptions[rule];
  if (handler) return handler(constraintValue);

  // Fallback
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

  // Custom file validation received formatting
  if (rule === VALIDATION_RULES.IS_VALID_FILE) {
    return value ? 'invalid file object' : 'no file';
  }
  if (rule === VALIDATION_RULES.IS_FILE_UPLOADED) {
    return 'no file';
  }
  if (rule === VALIDATION_RULES.IS_FILE_MIME_TYPE) {
    const file = value as FileLike;
    return typeof file?.mimetype === 'string' ? file.mimetype : 'unknown type';
  }
  if (rule === VALIDATION_RULES.IS_FILE_MAX_SIZE) {
    const file = value as FileLike;
    const size = typeof file?.size === 'number' ? file.size : undefined;
    return typeof size === 'number' ? formatFileSize(size) : 'unknown size';
  }

  return safeToString(value);
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
        message: message,
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

  return new ValidationException(details);
}
