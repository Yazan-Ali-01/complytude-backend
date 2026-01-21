import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Standard UUID parameter validation
 * Used for path parameters that expect a UUID
 */
export class UuidParamDto {
  @ApiProperty({
    description: 'UUID identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid UUID format' })
  id: string;
}

/**
 * Tenant ID parameter
 */
export class TenantIdParamDto {
  @ApiProperty({
    description: 'Tenant UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid tenant ID format' })
  tenantId: string;
}

/**
 * User ID parameter
 */
export class UserIdParamDto {
  @ApiProperty({
    description: 'User UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid user ID format' })
  userId: string;
}

/**
 * Template ID parameter
 */
export class TemplateIdParamDto {
  @ApiProperty({
    description: 'Template UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid template ID format' })
  templateId: string;
}

/**
 * Document ID parameter
 */
export class DocumentIdParamDto {
  @ApiProperty({
    description: 'Document UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'Invalid document ID format' })
  documentId: string;
}
