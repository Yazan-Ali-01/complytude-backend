import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { MulterLikeFile } from '../interfaces/multer-file.interface';

/**
 * Format bytes into human-readable file size
 * @param bytes - Size in bytes
 * @returns Formatted string with appropriate unit (B, KB, MB, GB)
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const decimals = 2;

  if (bytes < k) {
    return `${bytes} B`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(decimals)} ${units[i]}`;
}

/**
 * Validator constraint for checking if file is uploaded
 */
@ValidatorConstraint({ name: 'isFileUploaded', async: false })
export class IsFileUploadedConstraint implements ValidatorConstraintInterface {
  validate(file: MulterLikeFile) {
    const size = typeof file?.size === 'number' ? file.size : 0;
    return !!(file && file.buffer && size > 0);
  }

  defaultMessage(_args: ValidationArguments) {
    return 'file must be uploaded';
  }
}

/**
 * Decorator to validate that a file has been uploaded
 *
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileUploaded()
 *   file: any;
 * }
 * ```
 */
export function IsFileUploaded(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFileUploaded',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsFileUploadedConstraint,
    });
  };
}

/**
 * Validator constraint for checking file MIME type
 */
@ValidatorConstraint({ name: 'isFileMimeType', async: false })
export class IsFileMimeTypeConstraint implements ValidatorConstraintInterface {
  validate(file: MulterLikeFile, args: ValidationArguments) {
    const allowedTypes = args.constraints[0] as string[];

    if (!file) {
      // If no file, let IsFileUploaded handle it
      return true;
    }

    const mimetype = typeof file?.mimetype === 'string' ? file.mimetype : '';
    return allowedTypes.includes(mimetype);
  }

  defaultMessage(args: ValidationArguments) {
    const allowedTypes = args.constraints[0] as string[];
    const file = args.value as MulterLikeFile;
    const actualType =
      typeof file?.mimetype === 'string' ? file.mimetype : 'unknown';

    return `file must be of type: ${allowedTypes.join(', ')} (received: ${actualType})`;
  }
}

/**
 * Decorator to validate file MIME type
 *
 * @param allowedTypes - Array of allowed MIME types
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileMimeType(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 *   file: any;
 * }
 * ```
 */
export function IsFileMimeType(
  allowedTypes: string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFileMimeType',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [allowedTypes],
      options: {
        ...validationOptions,
        context: {
          ...(validationOptions?.context ?? {}),
          constraint: allowedTypes,
        },
      },
      validator: IsFileMimeTypeConstraint,
    });
  };
}

/**
 * Validator constraint for checking file size
 */
@ValidatorConstraint({ name: 'isFileMaxSize', async: false })
export class IsFileMaxSizeConstraint implements ValidatorConstraintInterface {
  validate(file: MulterLikeFile, args: ValidationArguments) {
    const maxSize = args.constraints[0] as number;

    if (!file) {
      // If no file, let IsFileUploaded handle it
      return true;
    }

    const size = typeof file?.size === 'number' ? file.size : 0;
    return size <= maxSize;
  }

  defaultMessage(args: ValidationArguments) {
    const maxSize = args.constraints[0] as number;
    const file = args.value as MulterLikeFile;
    const actualSize = typeof file?.size === 'number' ? file.size : 0;

    const expected = formatFileSize(maxSize);
    const actual = formatFileSize(actualSize);

    return `file size must not exceed ${expected} (received: ${actual})`;
  }
}

/**
 * Decorator to validate maximum file size
 *
 * @param maxBytes - Maximum allowed file size in bytes
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileMaxSize(5 * 1024 * 1024) // 5MB
 *   file: any;
 * }
 * ```
 */
export function IsFileMaxSize(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFileMaxSize',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [maxBytes],
      options: {
        ...validationOptions,
        context: {
          ...(validationOptions?.context ?? {}),
          constraint: maxBytes,
        },
      },
      validator: IsFileMaxSizeConstraint,
    });
  };
}
