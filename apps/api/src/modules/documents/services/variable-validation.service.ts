import { BadRequestException, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { TemplateField } from '../../templates/entities/template-version.entity';
import { DocumentsI18n } from '../constants/i18n.constants';

/** Why a field failed, stable for clients that render their own text. */
export type VariableErrorCode =
  | 'unknown_field'
  | 'required'
  | 'pattern'
  | 'min_length'
  | 'max_length'
  | 'not_a_number'
  | 'min_value'
  | 'max_value'
  | 'invalid_date'
  | 'not_boolean'
  | 'not_an_option'
  | 'invalid_email'
  | 'invalid_phone';

export interface VariableValidationError {
  field: string;
  code: VariableErrorCode;
  /** Values the message refers to (limits, allowed options). */
  params?: Record<string, string | number>;
  /** In the request's language. */
  message: string;
}

const MESSAGE_KEYS: Record<VariableErrorCode, string> = {
  unknown_field: DocumentsI18n.errors.VARIABLE_UNKNOWN_FIELD,
  required: DocumentsI18n.errors.VARIABLE_REQUIRED,
  pattern: DocumentsI18n.errors.VARIABLE_PATTERN,
  min_length: DocumentsI18n.errors.VARIABLE_MIN_LENGTH,
  max_length: DocumentsI18n.errors.VARIABLE_MAX_LENGTH,
  not_a_number: DocumentsI18n.errors.VARIABLE_NOT_A_NUMBER,
  min_value: DocumentsI18n.errors.VARIABLE_MIN_VALUE,
  max_value: DocumentsI18n.errors.VARIABLE_MAX_VALUE,
  invalid_date: DocumentsI18n.errors.VARIABLE_INVALID_DATE,
  not_boolean: DocumentsI18n.errors.VARIABLE_NOT_BOOLEAN,
  not_an_option: DocumentsI18n.errors.VARIABLE_NOT_AN_OPTION,
  invalid_email: DocumentsI18n.errors.VARIABLE_INVALID_EMAIL,
  invalid_phone: DocumentsI18n.errors.VARIABLE_INVALID_PHONE,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

const BOOLEAN_TRUTHY = new Set<unknown>([true, 'true', 1]);
const BOOLEAN_FALSY = new Set<unknown>([false, 'false', 0]);

@Injectable()
export class VariableValidationService {
  constructor(private readonly i18n: I18nService) {}

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
        errors.push(this.fieldError(key, 'unknown_field', { field: key }));
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
          errors.push(this.fieldError(field.key, 'required'));
        }
        continue;
      }

      const fieldErrors = this.validateField(field, value);
      errors.push(...fieldErrors);
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: this.i18n.t(DocumentsI18n.errors.VARIABLES_INVALID, {
          args: { count: errors.length },
        }),
        errors,
      });
    }

    return this.formatValues(fields, merged);
  }

  private fieldError(
    field: string,
    code: VariableErrorCode,
    params?: Record<string, string | number>,
  ): VariableValidationError {
    return {
      field,
      code,
      ...(params ? { params } : {}),
      message: this.i18n.t(MESSAGE_KEYS[code], { args: params }),
    };
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
        errors.push(this.fieldError(field.key, 'pattern'));
      }
    }

    if (
      field.validation_rules?.min !== undefined &&
      str.length < field.validation_rules.min
    ) {
      errors.push(
        this.fieldError(field.key, 'min_length', {
          min: field.validation_rules.min,
        }),
      );
    }

    if (
      field.validation_rules?.max !== undefined &&
      str.length > field.validation_rules.max
    ) {
      errors.push(
        this.fieldError(field.key, 'max_length', {
          max: field.validation_rules.max,
        }),
      );
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
      errors.push(
        this.fieldError(field.key, 'not_a_number', { value: String(value) }),
      );
      return errors;
    }

    if (
      field.validation_rules?.min !== undefined &&
      num < field.validation_rules.min
    ) {
      errors.push(
        this.fieldError(field.key, 'min_value', {
          min: field.validation_rules.min,
        }),
      );
    }

    if (
      field.validation_rules?.max !== undefined &&
      num > field.validation_rules.max
    ) {
      errors.push(
        this.fieldError(field.key, 'max_value', {
          max: field.validation_rules.max,
        }),
      );
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
      errors.push(this.fieldError(field.key, 'invalid_date'));
    }

    return errors;
  }

  private validateBoolean(
    _field: TemplateField,
    value: unknown,
  ): VariableValidationError[] {
    const errors: VariableValidationError[] = [];

    if (!BOOLEAN_TRUTHY.has(value) && !BOOLEAN_FALSY.has(value)) {
      errors.push(this.fieldError(_field.key, 'not_boolean'));
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
      errors.push(
        this.fieldError(field.key, 'not_an_option', {
          options: allowedValues.join(', '),
        }),
      );
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
      errors.push(this.fieldError(field.key, 'invalid_email'));
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
      errors.push(this.fieldError(field.key, 'invalid_phone'));
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
        const currency = field.validation_rules?.custom;
        // Use decimal formatting only for currency fields; plain integers render
        // without decimals (e.g. probation_period: 90, not 90.00).
        const fractionDigits = currency ? 2 : Number.isInteger(num) ? 0 : 2;
        const formatted = num.toLocaleString('en-US', {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        });
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
