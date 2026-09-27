import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  type AllowedUploadContentType,
  UPLOAD_MAX_FILE_SIZE_BYTES,
} from '../constants/upload.constants';

export class UploadUrlDto {
  @ApiProperty({
    description: 'Original filename of the document to upload',
    example: 'employment-contract.pdf',
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  filename: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'application/pdf',
    enum: ALLOWED_UPLOAD_CONTENT_TYPES,
  })
  @IsString()
  @IsIn(ALLOWED_UPLOAD_CONTENT_TYPES)
  contentType: AllowedUploadContentType;

  @ApiProperty({
    description:
      'File size in bytes. Must be > 0 and within the configured limit.',
    example: 2048576,
    minimum: 1,
    maximum: UPLOAD_MAX_FILE_SIZE_BYTES,
  })
  @IsInt()
  @Min(1)
  @Max(UPLOAD_MAX_FILE_SIZE_BYTES)
  fileSizeBytes: number;
}

export class UploadUrlResponseDto {
  @ApiProperty({
    description: 'UUID of the created document record',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  documentId: string;

  @ApiProperty({
    description:
      'Presigned S3 PUT URL. Upload the file with a PUT request to this URL.',
    example:
      'https://s3.me-central-1.amazonaws.com/complytude-staging-quarantine/tenants/…?X-Amz-…',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'Seconds until the presigned URL expires',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'S3 key of the object that will be created after upload',
    example:
      'tenants/{tenantId}/documents/{documentId}/employment-contract.pdf',
  })
  s3Key: string;
}
