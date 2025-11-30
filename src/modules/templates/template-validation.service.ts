import { Injectable, Logger } from '@nestjs/common';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { TemplateField } from './entities/template-version.entity';

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  received: string;
  expected: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

@Injectable()
export class TemplateValidationService {
  private readonly logger = new Logger(TemplateValidationService.name);
  private readonly ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      coerceTypes: false,
      verbose: true,
      removeAdditional: 'all',
    });

    addFormats(this.ajv);
  }

  /**
   * Get the Ajv instance for schema validation
   * This will be used later for generating and validating schemas
   */
  getAjvInstance(): Ajv {
    return this.ajv;
  }

  /**
   * Validate user-provided variables against template field definitions
   * @param fields Array of template field definitions
   * @param variables User-provided variables to validate
   * @returns Validation result with valid flag and array of errors
   */
  validateVariables(
    fields: TemplateField[],
    variables: Record<string, any>,
  ): ValidationResult {
    try {
      const schema = this.generateSchemaFromFields(fields);

      const validate = this.ajv.compile(schema);

      const valid = validate(variables);

      if (valid) {
        return { valid: true };
      }

      const ajvErrors = validate.errors!;

      const errors = this.transformErrors(ajvErrors, fields);

      return {
        valid: false,
        errors,
      };
    } catch (error) {
      this.logger.error(
        `Error during validation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        valid: false,
        errors: [
          {
            field: 'system',
            rule: 'system',
            message: 'Validation failed due to internal error',
            received: 'error',
            expected: 'valid',
          },
        ],
      };
    }
  }

  /**
   * Transform Ajv errors into user-friendly validation errors
   */
  private transformErrors(
    ajvErrors: ErrorObject[],
    fields: TemplateField[],
  ): ValidationError[] {
    // Create a map of field keys to field definitions for quick lookup
    const fieldMap = new Map<string, TemplateField>();
    fields.forEach((field) => {
      fieldMap.set(field.key, field);
    });

    return ajvErrors.map((error) => {
      // Handle required field errors - they report the missing property in params
      let fieldKey = '';
      if (error.keyword === 'required' && error.params?.missingProperty) {
        fieldKey = error.params.missingProperty as string;
      } else if (
        error.keyword === 'additionalProperties' &&
        error.params?.additionalProperty
      ) {
        fieldKey = error.params.additionalProperty as string;
      } else if (
        error.keyword === 'unevaluatedProperties' &&
        error.params?.unevaluatedProperty
      ) {
        fieldKey = error.params.unevaluatedProperty as string;
      } else {
        fieldKey = this.extractFieldKey(error.instancePath);
      }

      const field = fieldMap.get(fieldKey);

      const received = this.extractReceivedValue(error);
      const expected = this.extractExpectedValue(error, field);
      const message = this.formatErrorMessage(
        error,
        field,
        fieldKey,
        received,
        expected,
      );

      return {
        field: fieldKey || 'unknown',
        rule: error.keyword,
        message,
        received,
        expected,
      };
    });
  }

  /**
   * Extract field key from error path
   */
  private extractFieldKey(path: string): string {
    if (!path) {
      return '';
    }

    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const segments = cleanPath.split('/');

    return segments[0] || '';
  }

  /**
   * Extract the received value/type from error
   */
  private extractReceivedValue(error: ErrorObject): string {
    switch (error.keyword) {
      case 'required':
        return 'undefined';

      case 'type':
        return typeof error.data;

      case 'format':
      case 'pattern':
      case 'enum':
        if (error.data !== undefined) {
          return typeof error.data === 'string'
            ? error.data
            : JSON.stringify(error.data);
        }
        return 'undefined';

      case 'minLength':
      case 'maxLength':
        if (error.data !== undefined) {
          return typeof error.data === 'string'
            ? String(error.data.length)
            : JSON.stringify(error.data);
        }
        return 'undefined';

      case 'minimum':
      case 'maximum':
        if (error.data !== undefined) {
          return JSON.stringify(error.data);
        }
        return 'undefined';

      case 'additionalProperties':
      case 'unevaluatedProperties':
        return 'present';

      default:
        if (error.data !== undefined) {
          return typeof error.data === 'string'
            ? error.data
            : JSON.stringify(error.data);
        }
        return 'undefined';
    }
  }

  /**
   * Extract the expected value/type from error
   */
  private extractExpectedValue(
    error: ErrorObject,
    field: TemplateField | undefined,
  ): string {
    switch (error.keyword) {
      case 'required':
        return field?.type || 'string';

      case 'type':
        return error.params?.type || 'unknown';

      case 'format':
        return error.params?.format || 'valid format';

      case 'minLength':
        return `at least ${error.params?.limit || 0} characters`;

      case 'maxLength':
        return `at most ${error.params?.limit || 0} characters`;

      case 'minimum':
        if (field?.type === 'date') {
          return `on or after ${error.params?.limit || ''}`;
        }
        return `at least ${error.params?.limit || 0}`;

      case 'maximum':
        if (field?.type === 'date') {
          return `on or before ${error.params?.limit || ''}`;
        }
        return `at most ${error.params?.limit || 0}`;

      case 'pattern':
        return 'match required pattern';

      case 'enum': {
        const allowedValues = error.params?.allowedValues;
        if (
          allowedValues &&
          Array.isArray(allowedValues) &&
          allowedValues.length > 0
        ) {
          return allowedValues.map(String).join(', ');
        }
        return 'allowed values';
      }

      case 'additionalProperties':
      case 'unevaluatedProperties':
        return 'not present';

      default:
        return 'valid value';
    }
  }

  /**
   * Format Ajv error into user-friendly message
   */
  private formatErrorMessage(
    error: ErrorObject,
    field: TemplateField | undefined,
    fieldKey: string,
    received: string,
    expected: string,
  ): string {
    const fieldLabel = field?.label || fieldKey || 'field';

    switch (error.keyword) {
      case 'required':
        return `Required field '${fieldLabel}' is missing`;

      case 'type':
        return `Field '${fieldLabel}' must be ${expected}, received ${received}`;

      case 'format':
        if (error.params?.format === 'date') {
          return `Field '${fieldLabel}' must be a valid date in YYYY-MM-DD format`;
        }
        if (error.params?.format === 'email') {
          return `Field '${fieldLabel}' must be a valid email address`;
        }
        return `Field '${fieldLabel}' must be a valid ${expected}`;

      case 'minLength':
      case 'maxLength':
      case 'minimum':
      case 'maximum':
        return `Field '${fieldLabel}' must be ${expected}`;

      case 'pattern':
        return `Field '${fieldLabel}' format is invalid`;

      case 'enum':
        return `Field '${fieldLabel}' must be one of: ${expected}`;

      case 'additionalProperties':
      case 'unevaluatedProperties':
        return `Unknown field '${error.params?.additionalProperty || error.params?.unevaluatedProperty}' is not allowed`;

      default: {
        const errorMessage = error.message || 'validation failed';
        return `Field '${fieldLabel}': ${errorMessage}`;
      }
    }
  }

  /**
   * Generate JSON schema from template field definitions
   * @param fields Array of template field definitions
   * @returns JSON schema compatible with Ajv
   */
  generateSchemaFromFields(fields: TemplateField[]): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (!fields || fields.length === 0) {
      return {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      };
    }

    fields.forEach((field) => {
      const fieldSchema = this.createFieldSchema(field, true);
      properties[field.key] = fieldSchema;

      if (field.required) {
        required.push(field.key);
      }
    });

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  /**
   * Create JSON schema for a single field
   */
  private createFieldSchema(
    field: TemplateField,
    required: boolean = false,
  ): Record<string, any> {
    const schema: Record<string, any> = {};

    switch (field.type) {
      case 'text':
      case 'textarea':
        schema.type = 'string';
        if (required) {
          schema.minLength = 1;
        }
        this.applyStringValidationRules(field, schema);
        break;

      case 'number':
        schema.type = 'number';
        this.applyNumberValidationRules(field, schema);
        break;

      case 'boolean':
        schema.type = 'boolean';
        // Boolean fields do not support min/max validation
        break;

      case 'date':
        schema.type = 'string';
        schema.format = 'date';
        this.applyDateValidationRules(field, schema);
        break;

      case 'email':
        schema.type = 'string';
        schema.format = 'email';
        this.applyStringValidationRules(field, schema);
        break;

      case 'phone':
        schema.type = 'string';
        this.applyStringValidationRules(field, schema);
        break;

      case 'select':
        schema.type = 'string';
        this.applySelectOptions(field, schema);
        this.applyStringValidationRules(field, schema);
        break;

      default:
        schema.type = 'string';
        this.applyStringValidationRules(field, schema);
    }

    return schema;
  }

  /**
   * Apply validation rules for string types
   */
  private applyStringValidationRules(
    field: TemplateField,
    schema: Record<string, any>,
  ): void {
    if (!field.validation_rules) {
      return;
    }

    if (field.validation_rules.min !== undefined) {
      schema.minLength = field.validation_rules.min;
    }

    if (field.validation_rules.max !== undefined) {
      schema.maxLength = field.validation_rules.max;
    }

    if (field.validation_rules.pattern) {
      schema.pattern = field.validation_rules.pattern;
    }
  }

  /**
   * Apply validation rules for number types
   */
  private applyNumberValidationRules(
    field: TemplateField,
    schema: Record<string, any>,
  ): void {
    if (!field.validation_rules) {
      return;
    }

    if (field.validation_rules.min !== undefined) {
      schema.minimum = field.validation_rules.min;
    }

    if (field.validation_rules.max !== undefined) {
      schema.maximum = field.validation_rules.max;
    }
  }

  /**
   * Apply validation rules for date types
   */
  private applyDateValidationRules(
    field: TemplateField,
    schema: Record<string, any>,
  ): void {
    if (!field.validation_rules) {
      return;
    }

    // Date strings can use minimum/maximum for lexicographic comparison (works with ISO format YYYY-MM-DD)
    // Convert numeric timestamps to ISO date strings (YYYY-MM-DD) for comparison
    if (field.validation_rules.min !== undefined) {
      const minValue = field.validation_rules.min;

      schema.minimum =
        typeof minValue === 'number'
          ? new Date(minValue).toISOString().split('T')[0]
          : String(minValue);
    }

    if (field.validation_rules.max !== undefined) {
      const maxValue = field.validation_rules.max;
      schema.maximum =
        typeof maxValue === 'number'
          ? new Date(maxValue).toISOString().split('T')[0]
          : String(maxValue);
    }
  }

  /**
   * Apply select field options as enum
   */
  private applySelectOptions(
    field: TemplateField,
    schema: Record<string, any>,
  ): void {
    if (!field.options || field.options.length === 0) {
      return;
    }

    // Handle both string[] and { label: string; value: string }[]
    if (typeof field.options[0] === 'string') {
      schema.enum = field.options as string[];
    } else {
      schema.enum = (field.options as { label: string; value: string }[]).map(
        (option) => option.value,
      );
    }
  }
}
