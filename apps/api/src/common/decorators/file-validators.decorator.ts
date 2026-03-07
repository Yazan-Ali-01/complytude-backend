import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { MulterLikeFile } from '../interfaces/multer-file.interface';
import { formatFileSize, isMulterLikeFile } from '../helper';

/**
 * Validator constraint for checking if value is a MulterLikeFile object
 */
@ValidatorConstraint({ name: 'isValidFile', async: false })
export class IsMulterLikeFileConstraint
  implements ValidatorConstraintInterface
{
  validate(file: unknown) {
    if (!file) {
      // If no file, let IsFileUploaded handle it
      return true;
    }

    return isMulterLikeFile(file);
  }

  defaultMessage(_args: ValidationArguments) {
    return 'A valid file must be provided';
  }
}

/**
 * Decorator to validate that a value is a MulterLikeFile object.
 *
 * **Note:** This validator assumes `@IsFileUploaded()` is also applied.
 * If no file is provided, this validator passes (letting IsFileUploaded handle it).
 *
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileUploaded()
 *   @IsMulterLikeFile()
 *   file: MulterLikeFile;
 * isValidFile */
export function IsMulterLikeFile(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidFile',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsMulterLikeFileConstraint,
    });
  };
}

/**
 * Validator constraint for checking if file is uploaded
 */
@ValidatorConstraint({ name: 'isFileUploaded', async: false })
export class IsFileUploadedConstraint implements ValidatorConstraintInterface {
  validate(file: MulterLikeFile) {
    return !!file;
  }

  defaultMessage(_args: ValidationArguments) {
    return 'File is required';
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
 *   file: MulterLikeFile;
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

    if (!isMulterLikeFile(file)) {
      // let others handle it
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

    return `Invalid file type. Allowed: ${allowedTypes.join(', ')}. Received: ${actualType}`;
  }
}

/**
 * Decorator to validate file MIME type.
 *
 * **Note:** This validator assumes `@IsFileUploaded()` is also applied.
 * If no file is provided, this validator passes (letting IsFileUploaded handle it).
 *
 * @param allowedTypes - Array of allowed MIME types
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileUploaded()
 *   @IsFileMimeType(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 *   file: MulterLikeFile;
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

    if (!isMulterLikeFile(file)) {
      // let others handle it
      return true;
    }

    return file.size <= maxSize;
  }

  defaultMessage(args: ValidationArguments) {
    const maxSize = args.constraints[0] as number;
    const file = args.value as MulterLikeFile;

    const expected = formatFileSize(maxSize);
    const actual =
      typeof file?.size === 'number'
        ? formatFileSize(file.size)
        : 'unknown size';

    return `File too large. Maximum size: ${expected}. Provided: ${actual}`;
  }
}

/**
 * Decorator to validate maximum file size.
 *
 * **Note:** This validator assumes `@IsFileUploaded()` is also applied.
 * If no file is provided, this validator passes (letting IsFileUploaded handle it).
 *
 * @param maxBytes - Maximum allowed file size in bytes
 * @param validationOptions - Optional validation options
 *
 * @example
 * ```typescript
 * class CreateTemplateDto {
 *   @IsFileUploaded()
 *   @IsFileMaxSize(5 * 1024 * 1024) // 5MB
 *   file: MulterLikeFile;
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
