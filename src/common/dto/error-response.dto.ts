import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard error response format
 * Used consistently across all API endpoints for error responses
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
    type: 'integer',
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message or array of validation errors',
    example: 'Validation failed',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({
    description: 'Error type/category',
    example: 'Bad Request',
  })
  error: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of when the error occurred',
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  timestamp?: string;

  @ApiProperty({
    description: 'API path where the error occurred',
    example: '/api/templates',
    required: false,
  })
  path?: string;
}

/**
 * Specific error response DTOs for common scenarios
 * These are used for Swagger documentation only
 */

export class UnauthorizedErrorDto extends ErrorResponseDto {
  @ApiProperty({ example: 401 })
  declare statusCode: 401;

  @ApiProperty({ example: 'Unauthorized' })
  declare error: 'Unauthorized';

  @ApiProperty({
    example: 'Access token is missing or invalid',
  })
  declare message: string;

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}

export class ForbiddenErrorDto extends ErrorResponseDto {
  @ApiProperty({ example: 403 })
  declare statusCode: 403;

  @ApiProperty({ example: 'Forbidden' })
  declare error: 'Forbidden';

  @ApiProperty({
    example: 'You do not have permission to access this resource',
  })
  declare message: string;

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}

export class NotFoundErrorDto extends ErrorResponseDto {
  @ApiProperty({ example: 404 })
  declare statusCode: 404;

  @ApiProperty({ example: 'Not Found' })
  declare error: 'Not Found';

  @ApiProperty({
    example: 'Resource not found',
  })
  declare message: string;

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}

export class ValidationErrorDto {
  @ApiProperty({ example: 400 })
  declare statusCode: 400;

  @ApiProperty({ example: 'Bad Request' })
  declare error: 'Bad Request';

  @ApiProperty({
    example: [
      'email must be a valid email address',
      'password must be at least 8 characters long',
    ],
    type: 'array',
    items: { type: 'string' },
  })
  declare message: string[];

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}

export class ConflictErrorDto {
  @ApiProperty({ example: 409 })
  declare statusCode: 409;

  @ApiProperty({ example: 'Conflict' })
  declare error: 'Conflict';

  @ApiProperty({
    example: 'Resource already exists',
  })
  declare message: string;

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}

export class InternalServerErrorDto extends ErrorResponseDto {
  @ApiProperty({ example: 500 })
  declare statusCode: 500;

  @ApiProperty({ example: 'Internal Server Error' })
  declare error: 'Internal Server Error';

  @ApiProperty({
    example: 'An unexpected error occurred',
  })
  declare message: string;

  @ApiProperty({
    example: '2026-01-21T10:30:00.000Z',
    required: false,
  })
  declare timestamp?: string;

  @ApiProperty({
    example: '/api/templates',
    required: false,
  })
  declare path?: string;
}
