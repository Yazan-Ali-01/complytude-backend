import { applyDecorators, Type } from '@nestjs/common';
import { ApiResponse, ApiQuery } from '@nestjs/swagger';
import {
  UnauthorizedErrorDto,
  ForbiddenErrorDto,
  NotFoundErrorDto,
  ValidationErrorDto,
  ConflictErrorDto,
  InternalServerErrorDto,
} from '@complytude/shared';
import { SwaggerCookieAuth } from './common';

/**
 * Standard error responses that apply to most endpoints
 */
export const ApiStandardErrors = () => {
  return applyDecorators(
    ApiResponse({
      status: 500,
      description: 'Internal server error',
      type: InternalServerErrorDto,
    }),
  );
};

/**
 * Authentication error responses (401)
 * Use for endpoints that require authentication
 */
export const ApiAuthErrors = () => {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description:
        'Unauthorized - Access token is missing, invalid, or expired',
      type: UnauthorizedErrorDto,
    }),
  );
};

/**
 * Authorization error responses (403)
 * Use for endpoints that require specific roles or permissions
 */
export const ApiForbiddenError = (description?: string) => {
  return ApiResponse({
    status: 403,
    description:
      description ||
      'Forbidden - You do not have permission to access this resource',
    type: ForbiddenErrorDto,
  });
};

/**
 * Not found error response (404)
 */
export const ApiNotFoundError = (resourceName = 'Resource') => {
  return ApiResponse({
    status: 404,
    description: `${resourceName} not found`,
    type: NotFoundErrorDto,
  });
};

/**
 * Validation error response (400)
 */
export const ApiValidationError = () => {
  return ApiResponse({
    status: 400,
    description: 'Validation failed - Invalid request data',
    type: ValidationErrorDto,
  });
};

/**
 * Conflict error response (409)
 */
export const ApiConflictError = (description?: string) => {
  return ApiResponse({
    status: 409,
    description: description || 'Conflict - Resource already exists',
    type: ConflictErrorDto,
  });
};

/**
 * Combine standard authenticated endpoint responses
 * Includes: 401 (Unauthorized), 500 (Internal Server Error)
 */
export const ApiAuthenticatedResponses = () => {
  return applyDecorators(
    SwaggerCookieAuth.accessToken(),
    ApiAuthErrors(),
    ApiStandardErrors(),
  );
};

/**
 * Combine responses for endpoints requiring specific roles
 * Includes: 401 (Unauthorized), 403 (Forbidden), 500 (Internal Server Error)
 */
export const ApiProtectedResponses = (description?: string) => {
  return applyDecorators(
    SwaggerCookieAuth.accessToken(),
    ApiAuthErrors(),
    ApiForbiddenError(description),
    ApiStandardErrors(),
  );
};

/**
 * Standard CRUD operation responses
 */

// Create operation (POST)
export const ApiCreateResponses = <T extends Type<any>>(
  responseType: T,
  resourceName: string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 201,
      description: `${resourceName} created successfully`,
      type: responseType,
    }),
    ApiValidationError(),
    ApiProtectedResponses(),
  );
};

// Read/Get operation (GET single)
export const ApiGetResponses = <T extends Type<any>>(
  responseType: T,
  resourceName: string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${resourceName} retrieved successfully`,
      type: responseType,
    }),
    ApiNotFoundError(resourceName),
    ApiAuthenticatedResponses(),
  );
};

// List operation (GET multiple)
export const ApiListResponses = <T extends Type<any>>(
  responseType: T,
  resourceName: string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${resourceName} list retrieved successfully`,
      type: responseType,
      isArray: false, // Usually wrapped in pagination
    }),
    ApiAuthenticatedResponses(),
  );
};

// Array operation (GET multiple - not paginated)
export const ApiArrayResponses = <T extends Type<any>>(
  responseType: T,
  resourceName: string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${resourceName} retrieved successfully`,
      type: [responseType],
      isArray: true,
    }),
    ApiAuthenticatedResponses(),
  );
};

// Update operation (PUT/PATCH)
export const ApiUpdateResponses = <T extends Type<any>>(
  responseType: T,
  resourceName: string,
) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${resourceName} updated successfully`,
      type: responseType,
    }),
    ApiValidationError(),
    ApiNotFoundError(resourceName),
    ApiProtectedResponses(),
  );
};

// Delete operation (DELETE)
export const ApiDeleteResponses = (resourceName: string) => {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: `${resourceName} deleted successfully`,
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: `${resourceName} deleted successfully`,
          },
        },
      },
    }),
    ApiNotFoundError(resourceName),
    ApiProtectedResponses(),
  );
};

/**
 * Public endpoint (no authentication required)
 */
export const ApiPublicResponses = () => {
  return applyDecorators(ApiStandardErrors());
};

/**
 * Pagination query parameters decorator
 */
export const ApiPaginationQuery = () => {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Page number (1-indexed)',
      example: 1,
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Number of items per page (max 100)',
      example: 20,
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      type: String,
      description: 'Field to sort by',
      example: 'createdAt',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      description: 'Sort order',
      example: 'desc',
    }),
  );
};

/**
 * Common filter query parameters
 */
export const ApiSearchQuery = () => {
  return ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for filtering results',
    example: 'employment',
  });
};

/**
 * Date range filter query parameters
 */
export const ApiDateRangeQuery = () => {
  return applyDecorators(
    ApiQuery({
      name: 'startDate',
      required: false,
      type: String,
      format: 'date-time',
      description: 'Filter results from this date (ISO 8601)',
      example: '2026-01-01T00:00:00Z',
    }),
    ApiQuery({
      name: 'endDate',
      required: false,
      type: String,
      format: 'date-time',
      description: 'Filter results until this date (ISO 8601)',
      example: '2026-12-31T23:59:59Z',
    }),
  );
};
