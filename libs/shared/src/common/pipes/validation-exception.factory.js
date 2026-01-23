"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationExceptionFactory = validationExceptionFactory;
const validation_exception_1 = require("../exceptions/validation.exception");
const helper_1 = require("../helper");
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
    IS_VALID_FILE: 'isValidFile',
    IS_FILE_UPLOADED: 'isFileUploaded',
    IS_FILE_MIME_TYPE: 'isFileMimeType',
    IS_FILE_MAX_SIZE: 'isFileMaxSize',
};
function safeToString(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number')
        return String(value);
    if (typeof value === 'boolean')
        return String(value);
    if (typeof value === 'bigint')
        return String(value);
    if (value instanceof Date)
        return value.toISOString();
    try {
        return JSON.stringify(value);
    }
    catch {
        return '';
    }
}
const ruleDescriptions = {
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
    [VALIDATION_RULES.MIN_DATE]: (v) => v ? `at least ${safeToString(v)}` : '',
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
        if (!v)
            return '';
        if (Array.isArray(v))
            return `one of: ${v.map(String).join(', ')}`;
        return `one of: ${safeToString(v)}`;
    },
    [VALIDATION_RULES.IS_IN]: (v) => {
        if (!v)
            return '';
        if (Array.isArray(v))
            return `one of: ${v.map(String).join(', ')}`;
        return `one of: ${safeToString(v)}`;
    },
    [VALIDATION_RULES.MATCHES]: (v) => v ? `matching pattern: ${safeToString(v)}` : 'matching pattern',
    [VALIDATION_RULES.IS_VALID_FILE]: () => 'a valid file',
    [VALIDATION_RULES.IS_FILE_UPLOADED]: () => 'a file',
    [VALIDATION_RULES.IS_FILE_MIME_TYPE]: (v) => {
        if (Array.isArray(v))
            return `file type: ${v.map(String).join(', ')}`;
        return 'valid file type';
    },
    [VALIDATION_RULES.IS_FILE_MAX_SIZE]: (v) => {
        const n = typeof v === 'number' ? v : undefined;
        return n === undefined
            ? 'valid file size'
            : `at most ${(0, helper_1.formatFileSize)(n)}`;
    },
};
const CONSTRAINT_PATTERNS = {
    [VALIDATION_RULES.MAX_LENGTH]: /(?:shorter than or equal to|at most) (\d+)/i,
    [VALIDATION_RULES.MIN_LENGTH]: /(?:longer than or equal to|at least) (\d+)/i,
    [VALIDATION_RULES.ARRAY_MIN_SIZE]: /at least (\d+)/i,
    [VALIDATION_RULES.ARRAY_MAX_SIZE]: /not more than (\d+)/i,
};
const GENERIC_CONSTRAINT_PATTERN = /(?:must be|at least|at most|greater than|less than|equal to) (\d+(?:\.\d+)?)/i;
function extractConstraintFromMessage(rule, message) {
    if (!message)
        return undefined;
    const pattern = CONSTRAINT_PATTERNS[rule];
    if (pattern) {
        const match = message.match(pattern);
        if (match)
            return Number(match[1]);
    }
    const genericMatch = message.match(GENERIC_CONSTRAINT_PATTERN);
    if (genericMatch)
        return Number(genericMatch[1]);
    return undefined;
}
function computeExpected(rule, constraintValue, message) {
    if (constraintValue === undefined && message) {
        constraintValue = extractConstraintFromMessage(rule, message);
    }
    const handler = ruleDescriptions[rule];
    if (handler)
        return handler(constraintValue);
    if (message) {
        const match = message.match(/(less than or equal to|at most|at least|greater than or equal to) (\d+)/i);
        if (match) {
            return `${match[1]} ${match[2]}`;
        }
    }
    return '';
}
function extractConstraintValue(contexts, rule) {
    if (!contexts || typeof contexts !== 'object') {
        return undefined;
    }
    const context = contexts[rule];
    if (!context || typeof context !== 'object') {
        return undefined;
    }
    return context.constraint;
}
function getReceivedValue(value, rule) {
    if (rule === VALIDATION_RULES.WHITELIST_VALIDATION) {
        return 'present';
    }
    if (value === undefined || value === null) {
        return '';
    }
    if (rule === VALIDATION_RULES.IS_VALID_FILE) {
        return value ? 'invalid file object' : 'no file';
    }
    if (rule === VALIDATION_RULES.IS_FILE_UPLOADED) {
        return 'no file';
    }
    if (rule === VALIDATION_RULES.IS_FILE_MIME_TYPE) {
        const file = value;
        return typeof file?.mimetype === 'string' ? file.mimetype : 'unknown type';
    }
    if (rule === VALIDATION_RULES.IS_FILE_MAX_SIZE) {
        const file = value;
        const size = typeof file?.size === 'number' ? file.size : undefined;
        return typeof size === 'number' ? (0, helper_1.formatFileSize)(size) : 'unknown size';
    }
    return safeToString(value);
}
function processValidationError(error, parentPath) {
    const fieldPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;
    const details = [];
    if (error.constraints) {
        for (const [rule, message] of Object.entries(error.constraints)) {
            const constraintValue = extractConstraintValue(error.contexts, rule);
            const received = getReceivedValue(error.value, rule);
            const expected = rule === VALIDATION_RULES.WHITELIST_VALIDATION
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
    if (error.children && error.children.length > 0) {
        for (const child of error.children) {
            details.push(...processValidationError(child, fieldPath));
        }
    }
    return details;
}
function validationExceptionFactory(validationErrors = []) {
    const details = validationErrors.flatMap((error) => processValidationError(error));
    return new validation_exception_1.ValidationException(details);
}
//# sourceMappingURL=validation-exception.factory.js.map