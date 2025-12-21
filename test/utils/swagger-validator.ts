import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

export class SwaggerValidator {
  private swagger: any;
  private ajv: Ajv;
  private schemas: Map<string, any> = new Map();

  constructor(swaggerPath?: string) {
    // Load Swagger specification
    const defaultPath = path.join(__dirname, '../swagger/swagger.json');
    const specPath = swaggerPath || defaultPath;

    if (fs.existsSync(specPath)) {
      this.swagger = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    } else {
      throw new Error(`Swagger file not found: ${specPath}`);
    }

    // Initialize AJV with formats
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });
    addFormats(this.ajv);

    // Extract and cache all schemas
    this.extractSchemas();
  }

  /**
   * Extract all schemas from Swagger components
   */
  private extractSchemas(): void {
    const components = this.swagger.components || {};
    const schemas = components.schemas || {};

    Object.entries(schemas).forEach(([name, schema]) => {
      this.schemas.set(name, schema);
    });

    console.log(`📋 Loaded ${this.schemas.size} schemas from Swagger`);
  }

  /**
   * Validate response body against schema
   */
  validateResponse(
    schemaName: string,
    data: any,
    _options: { strict?: boolean } = {},
  ): { valid: boolean; errors: any[] } {
    const schema = this.schemas.get(schemaName);

    if (!schema) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    // Compile and validate
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    return {
      valid: valid === true,
      errors: validate.errors || [],
    };
  }

  /**
   * Validate request body against schema
   */
  validateRequest(
    method: string,
    path: string,
    data: any,
  ): { valid: boolean; errors: any[] } {
    const pathItem = this.swagger.paths[path];

    if (!pathItem) {
      throw new Error(`Path not found in Swagger: ${path}`);
    }

    const operation = pathItem[method.toLowerCase()];

    if (!operation) {
      throw new Error(`Method ${method} not found for path: ${path}`);
    }

    const requestBody = operation.requestBody;

    if (!requestBody) {
      return { valid: true, errors: [] };
    }

    const content = requestBody.content || {};
    const jsonContent = content['application/json'];

    if (!jsonContent || !jsonContent.schema) {
      return { valid: true, errors: [] };
    }

    const schema = this.resolveSchema(jsonContent.schema);
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    return {
      valid: valid === true,
      errors: validate.errors || [],
    };
  }

  /**
   * Resolve schema reference
   */
  private resolveSchema(schemaRef: any): any {
    if (schemaRef.$ref) {
      const refPath = schemaRef.$ref.split('/');
      const schemaName = refPath[refPath.length - 1];
      return this.schemas.get(schemaName) || schemaRef;
    }

    return schemaRef;
  }

  /**
   * Get endpoint definition
   */
  getEndpoint(method: string, path: string): any {
    const pathItem = this.swagger.paths[path];

    if (!pathItem) {
      return null;
    }

    return pathItem[method.toLowerCase()];
  }

  /**
   * Check if endpoint requires authentication
   */
  requiresAuth(method: string, path: string): boolean {
    const endpoint = this.getEndpoint(method, path);

    if (!endpoint) {
      return false;
    }

    // Check for security requirements
    const security = endpoint.security || this.swagger.security || [];

    return security.length > 0;
  }

  /**
   * Get all endpoints
   */
  getAllEndpoints(): Array<{ method: string; path: string }> {
    const endpoints: Array<{ method: string; path: string }> = [];

    Object.entries(this.swagger.paths).forEach(
      ([path, pathItem]: [string, any]) => {
        const methods = ['get', 'post', 'put', 'patch', 'delete'];

        methods.forEach((method) => {
          if (pathItem[method]) {
            endpoints.push({ method: method.toUpperCase(), path });
          }
        });
      },
    );

    return endpoints;
  }

  /**
   * Get response schema for status code
   */
  getResponseSchema(method: string, path: string, statusCode: number): any {
    const endpoint = this.getEndpoint(method, path);

    if (!endpoint || !endpoint.responses) {
      return null;
    }

    const response = endpoint.responses[statusCode.toString()];

    if (!response) {
      return null;
    }

    const content = response.content || {};
    const jsonContent = content['application/json'];

    if (!jsonContent || !jsonContent.schema) {
      return null;
    }

    return this.resolveSchema(jsonContent.schema);
  }

  /**
   * Format validation errors for display
   */
  formatErrors(errors: any[]): string {
    return errors
      .map((err) => {
        const path = err.instancePath || err.dataPath || '';
        const message = err.message || 'validation failed';
        return `  - ${path}: ${message}`;
      })
      .join('\n');
  }
}

// Singleton instance
let validatorInstance: SwaggerValidator | null = null;

/**
 * Get or create validator instance
 */
export function getSwaggerValidator(swaggerPath?: string): SwaggerValidator {
  if (!validatorInstance) {
    validatorInstance = new SwaggerValidator(swaggerPath);
  }

  return validatorInstance;
}

/**
 * Validate response against Swagger schema
 */
export function validateSwaggerResponse(schemaName: string, data: any): void {
  const validator = getSwaggerValidator();
  const result = validator.validateResponse(schemaName, data);

  if (!result.valid) {
    const errors = validator.formatErrors(result.errors);
    throw new Error(`Swagger validation failed for ${schemaName}:\n${errors}`);
  }
}
