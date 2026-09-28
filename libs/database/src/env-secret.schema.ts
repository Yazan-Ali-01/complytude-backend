import * as Joi from 'joi';

/**
 * Values that ship in the .env.example files or code, or are otherwise obviously not a real secret.
 * Matched case-insensitively against the whole value or as a substring where marked.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /change[-_ ]?(this|me)/i,
  /your[-_ ].*(key|secret|password)/i,
  /placeholder/i,
  /fallback-secret/i,
  /^(postgres|password|secret|admin|test|changeme)$/i,
];

/**
 * A secret env var. Required everywhere (or optional, e.g. SSO that is off when empty); when
 * NODE_ENV=production a set value must also be at least `min` characters and not a placeholder,
 * so a forgotten or example value stops the boot with a clear error.
 */
export function secretEnv(
  name: string,
  options: { min: number; optional?: boolean },
): Joi.StringSchema {
  const base = options.optional
    ? Joi.string().allow('').optional()
    : Joi.string().required();
  const production = options.optional
    ? Joi.string().allow('')
    : Joi.string().required();
  return base.when('NODE_ENV', {
    is: 'production',
    then: production
      .min(options.min)
      .custom((value: string, helpers) =>
        PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
          ? helpers.error('secret.placeholder')
          : value,
      )
      .messages({
        'any.required': `${name} is required when NODE_ENV=production`,
        'string.empty': `${name} is required when NODE_ENV=production`,
        'string.min': `${name} must be at least ${options.min} characters when NODE_ENV=production`,
        'secret.placeholder': `${name} is a placeholder value; set a real secret when NODE_ENV=production`,
      }),
  });
}
