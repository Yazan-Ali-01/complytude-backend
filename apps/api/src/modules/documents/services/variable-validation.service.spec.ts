import { BadRequestException } from '@nestjs/common';
import { TemplateField } from '../../templates/entities/template-version.entity';
import {
  VariableValidationError,
  VariableValidationService,
} from './variable-validation.service';

function field(
  overrides: Partial<TemplateField> & Pick<TemplateField, 'key' | 'type'>,
): TemplateField {
  return {
    label: overrides.key,
    required: false,
    ...overrides,
  };
}

function expectError(
  service: VariableValidationService,
  fields: TemplateField[],
  userVars: Record<string, unknown>,
  systemVars: Record<string, unknown>,
  check: (errors: VariableValidationError[]) => void,
): void {
  try {
    service.validate(fields, userVars, systemVars);
    throw new Error('Expected BadRequestException but none was thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      errors: VariableValidationError[];
    };
    check(body.errors);
  }
}

function expectErrorMessage(
  service: VariableValidationService,
  fields: TemplateField[],
  userVars: Record<string, unknown>,
  systemVars: Record<string, unknown>,
  check: (body: {
    statusCode: number;
    message: string;
    errors: VariableValidationError[];
  }) => void,
): void {
  try {
    service.validate(fields, userVars, systemVars);
    throw new Error('Expected BadRequestException but none was thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      statusCode: number;
      message: string;
      errors: VariableValidationError[];
    };
    check(body);
  }
}

describe('VariableValidationService', () => {
  let service: VariableValidationService;

  beforeEach(() => {
    service = new VariableValidationService();
  });

  // ---------------------------------------------------------------------------
  // text
  // ---------------------------------------------------------------------------
  describe('text field', () => {
    it('accepts a valid string', () => {
      const result = service.validate(
        [field({ key: 'name', type: 'text' })],
        { name: 'Alice' },
        {},
      );
      expect(result.name).toBe('Alice');
    });

    it('trims whitespace on output', () => {
      const result = service.validate(
        [field({ key: 'name', type: 'text' })],
        { name: '  Alice  ' },
        {},
      );
      expect(result.name).toBe('Alice');
    });

    it('throws when required field is missing', () => {
      expectError(
        service,
        [field({ key: 'name', type: 'text', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'name',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws when required field is empty string', () => {
      expectError(
        service,
        [field({ key: 'name', type: 'text', required: true })],
        { name: '' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'name',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws when required field is null', () => {
      expectError(
        service,
        [field({ key: 'name', type: 'text', required: true })],
        { name: null },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'name',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('applies pattern validation', () => {
      expectError(
        service,
        [
          field({
            key: 'code',
            type: 'text',
            validation_rules: { pattern: '^[A-Z]+$' },
          }),
        ],
        { code: 'abc' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'code',
            message: 'Value does not match required pattern',
          });
        },
      );
    });

    it('passes pattern validation when value matches', () => {
      const result = service.validate(
        [
          field({
            key: 'code',
            type: 'text',
            validation_rules: { pattern: '^[A-Z]+$' },
          }),
        ],
        { code: 'ABC' },
        {},
      );
      expect(result.code).toBe('ABC');
    });

    it('enforces min length', () => {
      expectError(
        service,
        [field({ key: 'bio', type: 'text', validation_rules: { min: 5 } })],
        { bio: 'hi' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'bio',
            message: 'Must be at least 5 characters',
          });
        },
      );
    });

    it('enforces max length', () => {
      expectError(
        service,
        [field({ key: 'bio', type: 'text', validation_rules: { max: 3 } })],
        { bio: 'toolong' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'bio',
            message: 'Must be at most 3 characters',
          });
        },
      );
    });

    it('optional field with no value is omitted from output', () => {
      const result = service.validate(
        [field({ key: 'name', type: 'text', required: false })],
        {},
        {},
      );
      expect(result).not.toHaveProperty('name');
    });
  });

  // ---------------------------------------------------------------------------
  // textarea
  // ---------------------------------------------------------------------------
  describe('textarea field', () => {
    it('accepts a valid textarea value', () => {
      const result = service.validate(
        [field({ key: 'notes', type: 'textarea' })],
        { notes: '  some notes  ' },
        {},
      );
      expect(result.notes).toBe('some notes');
    });

    it('throws when required textarea is missing', () => {
      expectError(
        service,
        [field({ key: 'notes', type: 'textarea', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'notes',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('enforces min/max length same as text', () => {
      expectError(
        service,
        [
          field({
            key: 'notes',
            type: 'textarea',
            validation_rules: { min: 10, max: 50 },
          }),
        ],
        { notes: 'short' },
        {},
        (errors) => {
          expect(errors).toContainEqual(
            expect.objectContaining({ field: 'notes' }),
          );
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // number
  // ---------------------------------------------------------------------------
  describe('number field', () => {
    it('accepts a numeric string and formats it (integers without a currency get no decimals)', () => {
      const result = service.validate(
        [field({ key: 'salary', type: 'number' })],
        { salary: '50000' },
        {},
      );
      expect(result.salary).toBe('50,000');
    });

    it('accepts a JS number and formats it', () => {
      const result = service.validate(
        [field({ key: 'salary', type: 'number' })],
        { salary: 1234.5 },
        {},
      );
      expect(result.salary).toBe('1,234.50');
    });

    it('accepts 0 as a valid number (not treated as empty)', () => {
      const result = service.validate(
        [field({ key: 'count', type: 'number' })],
        { count: 0 },
        {},
      );
      expect(result.count).toBe('0');
    });

    it('accepts 0 for a required number field', () => {
      const result = service.validate(
        [field({ key: 'count', type: 'number', required: true })],
        { count: 0 },
        {},
      );
      expect(result.count).toBe('0');
    });

    it('appends currency when validation_rules.custom is set', () => {
      const result = service.validate(
        [
          field({
            key: 'salary',
            type: 'number',
            validation_rules: { custom: 'AED' },
          }),
        ],
        { salary: 50000 },
        {},
      );
      expect(result.salary).toBe('50,000.00 AED');
    });

    it('throws when required number is missing', () => {
      expectError(
        service,
        [field({ key: 'salary', type: 'number', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'salary',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws when value is not numeric', () => {
      expectError(
        service,
        [field({ key: 'salary', type: 'number' })],
        { salary: 'abc' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'salary',
            message: "Must be a number, got 'abc'",
          });
        },
      );
    });

    it('enforces min value', () => {
      expectError(
        service,
        [
          field({
            key: 'age',
            type: 'number',
            validation_rules: { min: 18 },
          }),
        ],
        { age: 16 },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'age',
            message: 'Must be at least 18',
          });
        },
      );
    });

    it('enforces max value', () => {
      expectError(
        service,
        [
          field({
            key: 'age',
            type: 'number',
            validation_rules: { max: 65 },
          }),
        ],
        { age: 70 },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'age',
            message: 'Must be at most 65',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // date
  // ---------------------------------------------------------------------------
  describe('date field', () => {
    it('accepts a valid ISO date and formats it to locale string', () => {
      const result = service.validate(
        [field({ key: 'dob', type: 'date' })],
        { dob: '2026-03-29' },
        {},
      );
      expect(result.dob).toBe('29 March 2026');
    });

    it('uses validation_rules.custom as locale for formatting', () => {
      const result = service.validate(
        [
          field({
            key: 'start',
            type: 'date',
            validation_rules: { custom: 'en-US' },
          }),
        ],
        { start: '2026-03-29' },
        {},
      );
      expect(result.start).toBe('March 29, 2026');
    });

    it('throws when required date is missing', () => {
      expectError(
        service,
        [field({ key: 'start_date', type: 'date', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'start_date',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws for invalid date format', () => {
      expectError(
        service,
        [field({ key: 'start_date', type: 'date' })],
        { start_date: '29/03/2026' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'start_date',
            message: 'Invalid date format, expected YYYY-MM-DD',
          });
        },
      );
    });

    it('throws for non-date ISO string', () => {
      expectError(
        service,
        [field({ key: 'start_date', type: 'date' })],
        { start_date: '9999-99-99' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'start_date',
            message: 'Invalid date format, expected YYYY-MM-DD',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // boolean
  // ---------------------------------------------------------------------------
  describe('boolean field', () => {
    it('accepts true', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: true },
        {},
      );
      expect(result.active).toBe(true);
    });

    it('accepts false', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: false },
        {},
      );
      expect(result.active).toBe(false);
    });

    it('accepts false for a required boolean (not treated as empty)', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean', required: true })],
        { active: false },
        {},
      );
      expect(result.active).toBe(false);
    });

    it('coerces string "true" to true', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: 'true' },
        {},
      );
      expect(result.active).toBe(true);
    });

    it('coerces string "false" to false', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: 'false' },
        {},
      );
      expect(result.active).toBe(false);
    });

    it('coerces numeric 1 to true', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: 1 },
        {},
      );
      expect(result.active).toBe(true);
    });

    it('coerces numeric 0 to false', () => {
      const result = service.validate(
        [field({ key: 'active', type: 'boolean' })],
        { active: 0 },
        {},
      );
      expect(result.active).toBe(false);
    });

    it('throws for non-boolean value', () => {
      expectError(
        service,
        [field({ key: 'active', type: 'boolean' })],
        { active: 'yes' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'active',
            message: 'Must be true or false',
          });
        },
      );
    });

    it('throws when required boolean is missing', () => {
      expectError(
        service,
        [field({ key: 'active', type: 'boolean', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'active',
            message: 'Required field is missing',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // select
  // ---------------------------------------------------------------------------
  describe('select field', () => {
    it('accepts a value present in string options', () => {
      const result = service.validate(
        [
          field({
            key: 'status',
            type: 'select',
            options: ['active', 'inactive'],
          }),
        ],
        { status: 'active' },
        {},
      );
      expect(result.status).toBe('active');
    });

    it('accepts a value present in object options', () => {
      const result = service.validate(
        [
          field({
            key: 'status',
            type: 'select',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ],
          }),
        ],
        { status: 'inactive' },
        {},
      );
      expect(result.status).toBe('inactive');
    });

    it('throws when value is not in string options', () => {
      expectError(
        service,
        [
          field({
            key: 'status',
            type: 'select',
            options: ['active', 'inactive'],
          }),
        ],
        { status: 'pending' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'status',
            message: 'Must be one of: active, inactive',
          });
        },
      );
    });

    it('throws when value is not in object options', () => {
      expectError(
        service,
        [
          field({
            key: 'status',
            type: 'select',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ],
          }),
        ],
        { status: 'pending' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'status',
            message: 'Must be one of: active, inactive',
          });
        },
      );
    });

    it('throws when required select is missing', () => {
      expectError(
        service,
        [
          field({
            key: 'status',
            type: 'select',
            required: true,
            options: ['active'],
          }),
        ],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'status',
            message: 'Required field is missing',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // email
  // ---------------------------------------------------------------------------
  describe('email field', () => {
    it('accepts valid email and lowercases+trims it', () => {
      const result = service.validate(
        [field({ key: 'email', type: 'email' })],
        { email: '  ALICE@EXAMPLE.COM  ' },
        {},
      );
      expect(result.email).toBe('alice@example.com');
    });

    it('throws when required email is missing', () => {
      expectError(
        service,
        [field({ key: 'email', type: 'email', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'email',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws for invalid email format', () => {
      expectError(
        service,
        [field({ key: 'email', type: 'email' })],
        { email: 'not-an-email' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'email',
            message: 'Invalid email format',
          });
        },
      );
    });

    it('throws for email without domain extension', () => {
      expectError(
        service,
        [field({ key: 'email', type: 'email' })],
        { email: 'alice@example' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'email',
            message: 'Invalid email format',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // phone
  // ---------------------------------------------------------------------------
  describe('phone field', () => {
    it('accepts a valid international phone number', () => {
      const result = service.validate(
        [field({ key: 'phone', type: 'phone' })],
        { phone: '+971501234567' },
        {},
      );
      expect(result.phone).toBe('+971501234567');
    });

    it('trims whitespace from phone', () => {
      const result = service.validate(
        [field({ key: 'phone', type: 'phone' })],
        { phone: '  +1 800 555 1234  ' },
        {},
      );
      expect(result.phone).toBe('+1 800 555 1234');
    });

    it('throws when required phone is missing', () => {
      expectError(
        service,
        [field({ key: 'phone', type: 'phone', required: true })],
        {},
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'phone',
            message: 'Required field is missing',
          });
        },
      );
    });

    it('throws for invalid phone format', () => {
      expectError(
        service,
        [field({ key: 'phone', type: 'phone' })],
        { phone: 'not-a-phone!!!' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'phone',
            message: 'Invalid phone number format',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown field rejection
  // ---------------------------------------------------------------------------
  describe('unknown field rejection', () => {
    it('throws for a user-provided field not in the definition', () => {
      expectError(
        service,
        [field({ key: 'name', type: 'text' })],
        { name: 'Alice', injected_field: 'evil' },
        {},
        (errors) => {
          expect(errors).toContainEqual({
            field: 'injected_field',
            message: "Unknown field 'injected_field' is not allowed",
          });
        },
      );
    });

    it('throws for multiple unknown fields at once', () => {
      expectError(service, [], { foo: 'bar', baz: 'qux' }, {}, (errors) => {
        expect(errors.some((e) => e.field === 'foo')).toBe(true);
        expect(errors.some((e) => e.field === 'baz')).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // System variable merging
  // ---------------------------------------------------------------------------
  describe('system variable merging', () => {
    it('applies system variable when user provides no value', () => {
      const result = service.validate(
        [
          field({
            key: 'company_name',
            type: 'text',
            system_variable_key: 'tenant.name',
          }),
        ],
        {},
        { 'tenant.name': 'Acme Corp' },
      );
      expect(result.company_name).toBe('Acme Corp');
    });

    it('user-provided value takes precedence over system variable', () => {
      const result = service.validate(
        [
          field({
            key: 'company_name',
            type: 'text',
            system_variable_key: 'tenant.name',
          }),
        ],
        { company_name: 'My Company' },
        { 'tenant.name': 'Acme Corp' },
      );
      expect(result.company_name).toBe('My Company');
    });

    it('ignores system variables that do not match any system_variable_key', () => {
      const result = service.validate(
        [field({ key: 'name', type: 'text' })],
        { name: 'Alice' },
        { 'tenant.logo': 'logo.png' },
      );
      expect(result).not.toHaveProperty('tenant.logo');
    });

    it('validates system-provided values (rejects invalid system input)', () => {
      expectError(
        service,
        [
          field({
            key: 'salary',
            type: 'number',
            system_variable_key: 'sys.salary',
          }),
        ],
        {},
        { 'sys.salary': 'not-a-number' },
        (errors) => {
          expect(errors).toContainEqual(
            expect.objectContaining({
              field: 'salary',
              message: expect.stringContaining('Must be a number'),
            }),
          );
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Default values
  // ---------------------------------------------------------------------------
  describe('default values', () => {
    it('applies field default_value when user provides no value', () => {
      const result = service.validate(
        [
          field({
            key: 'currency',
            type: 'text',
            default_value: 'AED',
          }),
        ],
        {},
        {},
      );
      expect(result.currency).toBe('AED');
    });

    it('user-provided value overrides default_value', () => {
      const result = service.validate(
        [
          field({
            key: 'currency',
            type: 'text',
            default_value: 'AED',
          }),
        ],
        { currency: 'USD' },
        {},
      );
      expect(result.currency).toBe('USD');
    });

    it('system variable overrides default_value, but user overrides both', () => {
      const result = service.validate(
        [
          field({
            key: 'currency',
            type: 'text',
            default_value: 'AED',
            system_variable_key: 'tenant.currency',
          }),
        ],
        { currency: 'GBP' },
        { 'tenant.currency': 'USD' },
      );
      expect(result.currency).toBe('GBP');
    });

    it('system variable is used when no user value (overrides field default)', () => {
      const result = service.validate(
        [
          field({
            key: 'currency',
            type: 'text',
            default_value: 'AED',
            system_variable_key: 'tenant.currency',
          }),
        ],
        {},
        { 'tenant.currency': 'USD' },
      );
      expect(result.currency).toBe('USD');
    });
  });

  // ---------------------------------------------------------------------------
  // All errors returned at once (not first-failure)
  // ---------------------------------------------------------------------------
  describe('all errors at once', () => {
    it('returns all field errors in a single exception', () => {
      expectError(
        service,
        [
          field({ key: 'name', type: 'text', required: true }),
          field({ key: 'salary', type: 'number', required: true }),
          field({ key: 'start_date', type: 'date', required: true }),
        ],
        {},
        {},
        (errors) => {
          expect(errors).toHaveLength(3);
          expect(errors.map((e) => e.field)).toEqual(
            expect.arrayContaining(['name', 'salary', 'start_date']),
          );
        },
      );
    });

    it('includes plural "fields" in message when multiple errors', () => {
      expectErrorMessage(
        service,
        [
          field({ key: 'a', type: 'text', required: true }),
          field({ key: 'b', type: 'text', required: true }),
        ],
        {},
        {},
        (body) => {
          expect(body.message).toBe('Validation failed for 2 fields');
        },
      );
    });

    it('uses singular "field" in message for a single error', () => {
      expectErrorMessage(
        service,
        [field({ key: 'a', type: 'text', required: true })],
        {},
        {},
        (body) => {
          expect(body.message).toBe('Validation failed for 1 field');
        },
      );
    });

    it('combines unknown field errors with validation errors', () => {
      expectError(
        service,
        [field({ key: 'name', type: 'text', required: true })],
        { injected: 'evil' },
        {},
        (errors) => {
          expect(errors.some((e) => e.field === 'injected')).toBe(true);
          expect(errors.some((e) => e.field === 'name')).toBe(true);
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Response format
  // ---------------------------------------------------------------------------
  describe('error response format', () => {
    it('throws BadRequestException with statusCode 400', () => {
      expectErrorMessage(
        service,
        [field({ key: 'name', type: 'text', required: true })],
        {},
        {},
        (body) => {
          expect(body.statusCode).toBe(400);
          expect(typeof body.message).toBe('string');
          expect(Array.isArray(body.errors)).toBe(true);
          expect(body.errors[0]).toMatchObject({
            field: expect.any(String),
            message: expect.any(String),
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('returns empty object when fields array and variables are empty', () => {
      const result = service.validate([], {}, {});
      expect(result).toEqual({});
    });

    it('null user-provided value for optional field is omitted from output', () => {
      const result = service.validate(
        [field({ key: 'notes', type: 'text', required: false })],
        { notes: null },
        {},
      );
      expect(result).not.toHaveProperty('notes');
    });

    it('null user-provided value overrides system variable and default', () => {
      expectError(
        service,
        [
          field({
            key: 'name',
            type: 'text',
            required: true,
            default_value: 'Default',
            system_variable_key: 'sys.name',
          }),
        ],
        { name: null },
        { 'sys.name': 'System' },
        (errors) => {
          expect(errors).toContainEqual({
            field: 'name',
            message: 'Required field is missing',
          });
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path: valid input returns formatted values
  // ---------------------------------------------------------------------------
  describe('full validation pass', () => {
    it('returns all field values formatted when all valid', () => {
      const fields: TemplateField[] = [
        field({ key: 'employee_name', type: 'text', required: true }),
        field({
          key: 'salary',
          type: 'number',
          required: true,
          validation_rules: { custom: 'AED' },
        }),
        field({ key: 'start_date', type: 'date', required: true }),
        field({ key: 'is_manager', type: 'boolean' }),
        field({
          key: 'department',
          type: 'select',
          options: ['engineering', 'hr'],
        }),
        field({ key: 'work_email', type: 'email' }),
        field({ key: 'mobile', type: 'phone' }),
      ];

      const result = service.validate(
        fields,
        {
          employee_name: '  Bob Smith  ',
          salary: 75000,
          start_date: '2026-03-29',
          is_manager: 'true',
          department: 'engineering',
          work_email: 'BOB@COMPANY.COM',
          mobile: '+971 50 123 4567',
        },
        {},
      );

      expect(result.employee_name).toBe('Bob Smith');
      expect(result.salary).toBe('75,000.00 AED');
      expect(result.start_date).toBe('29 March 2026');
      expect(result.is_manager).toBe(true);
      expect(result.department).toBe('engineering');
      expect(result.work_email).toBe('bob@company.com');
      expect(result.mobile).toBe('+971 50 123 4567');
    });
  });
});
