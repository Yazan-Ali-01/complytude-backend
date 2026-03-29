import { BadRequestException, Injectable } from '@nestjs/common';
import { TemplateField } from '../../templates/entities/template-version.entity';

export interface VariableValidationError {
  field: string;
  message: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

const BOOLEAN_TRUTHY = new Set<unknown>([true, 'true', 1]);
const BOOLEAN_FALSY = new Set<unknown>([false, 'false', 0]);

@Injectable()
export class VariableValidationService {
  /**
   * Validates user input against field definitions.
   * Merges system variables and applies defaults before validation.
   * Returns validated + coerced + formatted values ready for rendering.
   * Throws BadRequestException with all field-level errors at once.
   */
  validate(
    fields: TemplateField[],
    userVariables: Record<string, unknown>,
    systemVariables: Record<string, unknown>,
  ): Record<string, unknown> {
    const errors: VariableValidationError[] = [];
    const fieldMap = new Map(fields.map((f) => [f.key, f]));

    for (const key of Object.keys(userVariables)) {
      if (!fieldMap.has(key)) {
        errors.push({
          field: key,
          message: `Unknown field '${key}' is not allowed`,
        });
      }
    }

    const merged: Record<string, unknown> = {};
    for (const field of fields) {
      let value: unknown = undefined;

      if (
        field.system_variable_key !== undefined &&
        systemVariables[field.system_variable_key] !== undefined
      ) {
        value = systemVariables[field.system_variable_key];
      }

      if (value === undefined && field.default_value !== undefined) {
        value = field.default_value;
      }

      if (userVariables[field.key] !== undefined) {
        value = userVariables[field.key];
      }

      if (value !== undefined) {
        merged[field.key] = value;
      }
    }

    for (const field of fields) {
      const value = merged[field.key];

      if (this.isEmpty(value)) {
        if (field.required) {
          errors.push({
            field: field.key,
            message: 'Required field is missing',
          });
        }
        continue;
      }

      const fieldErrors = this.validateField(field, value);
      errors.push(...fieldErrors);
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Validation failed for ${errors.length} field${errors.length === 1 ? '' : 's'}`,
        errors,
      });
    }

    return this.formatValues(fields, merged);
  }

  private validateField(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    switch (field.type) {
      case 'text':
      case 'textarea':
        return this.validateText(field, value);
      case 'number':
        return this.validateNumber(field, value);
      case 'date':
        return this.validateDate(field, value);
      case 'boolean':
        return this.validateBoolean(field, value);
      case 'select':
        return this.validateSelect(field, value);
      case 'email':
        return this.validateEmail(field, value);
      case 'phone':
        return this.validatePhone(field, value);
      default:
        return [];
    }
  }

  private isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
  }

  private validateText(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];
    const str = String(value).trim();

    if (field.validation_rules?.pattern) {
      const regex = new RegExp(field.validation_rules.pattern);
      if (!regex.test(str)) {
        errors.push({
          field: field.key,
          message: 'Value does not match required pattern',
        });
      }
    }

    if (
      field.validation_rules?.min !== undefined &&
      str.length < field.validation_rules.min
    ) {
      errors.push({
        field: field.key,
        message: `Must be at least ${field.validation_rules.min} characters`,
      });
    }

    if (
      field.validation_rules?.max !== undefined &&
      str.length > field.validation_rules.max
    ) {
      errors.push({
        field: field.key,
        message: `Must be at most ${field.validation_rules.max} characters`,
      });
    }

    return errors;
  }

  private validateNumber(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];

    const num = Number(value);
    if (isNaN(num)) {
      errors.push({
        field: field.key,
        message: `Must be a number, got '${String(value)}'`,
      });
      return errors;
    }

    if (
      field.validation_rules?.min !== undefined &&
      num < field.validation_rules.min
    ) {
      errors.push({
        field: field.key,
        message: `Must be at least ${field.validation_rules.min}`,
      });
    }

    if (
      field.validation_rules?.max !== undefined &&
      num > field.validation_rules.max
    ) {
      errors.push({
        field: field.key,
        message: `Must be at most ${field.validation_rules.max}`,
      });
    }

    return errors;
  }

  private validateDate(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];
    const str = String(value);

    if (!ISO_DATE_RE.test(str) || isNaN(Date.parse(str))) {
      errors.push({
        field: field.key,
        message: 'Invalid date format, expected YYYY-MM-DD',
      });
    }

    return errors;
  }

  private validateBoolean(
    _field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];

    if (!BOOLEAN_TRUTHY.has(value) && !BOOLEAN_FALSY.has(value)) {
      errors.push({ field: _field.key, message: 'Must be true or false' });
    }

    return errors;
  }

  private validateSelect(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];

    if (!field.options || field.options.length === 0) {
      return errors;
    }

    const allowedValues =
      typeof field.options[0] === 'string'
        ? (field.options as string[])
        : (field.options as { label: string; value: string }[]).map(
            (o) => o.value,
          );

    if (!allowedValues.includes(String(value))) {
      errors.push({
        field: field.key,
        message: `Must be one of: ${allowedValues.join(', ')}`,
      });
    }

    return errors;
  }

  private validateEmail(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];
    const email = String(value).trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      errors.push({ field: field.key, message: 'Invalid email format' });
    }

    return errors;
  }

  private validatePhone(
    field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];
    const phone = String(value).trim();

    if (!PHONE_RE.test(phone)) {
      errors.push({
        field: field.key,
        message: 'Invalid phone number format',
      });
    }

    return errors;
  }

  private formatValues(
    fields: TemplateField[],
    merged: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const field of fields) {
      const value = merged[field.key];
      if (this.isEmpty(value)) {
        continue;
      }
      result[field.key] = this.formatValue(field, value);
    }

    return result;
  }

  private formatValue(field: TemplateField, value: unknown): unknown {
    switch (field.type) {
      case 'text':
      case 'textarea':
        return String(value).trim();

      case 'number': {
        const num = Number(value);
        const formatted = num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const currency = field.validation_rules?.custom;
        return currency ? `${formatted} ${currency}` : formatted;
      }

      case 'date': {
        const date = new Date(String(value));
        const locale = field.validation_rules?.custom ?? 'en-GB';
        return date.toLocaleDateString(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
      }

      case 'boolean': {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 1) return true;
        if (value === 'false' || value === 0) return false;
        return Boolean(value);
      }

      case 'email':
        return String(value).trim().toLowerCase();

      case 'phone':
        return String(value).trim();

      case 'select':
        return String(value);

      default:
        return value;
    }
  }
}
