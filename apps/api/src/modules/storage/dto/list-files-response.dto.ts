import { ApiProperty } from '@nestjs/swagger';

export class UploadFileResponseDto {
  @ApiProperty({
    description: 'Signed URL for accessing the uploaded file',
    example:
      'https://complytude-files.s3.eu-central-1.amazonaws.com/tenants/abc123/1698765432000-document.pdf?X-Amz-Algorithm=...',
  })
  url: string;

  @ApiProperty({
    description: 'File key/identifier in storage',
    example: 'tenants/abc123/1698765432000-document.pdf',
  })
  key: string;

  @ApiProperty({
    description: 'S3 bucket name',
    example: 'complytude-files',
  })
  bucket: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  size: number;

  @ApiProperty({
    description: 'File content type',
    example: 'application/pdf',
  })
  contentType: string;
}

export class FileListItemDto {
  @ApiProperty({
    description: 'File key/identifier in storage',
    example: 'tenants/abc123/1698765432000-document.pdf',
  })
  key: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  size: number;

  @ApiProperty({
    description: 'Last modified date',
    example: '2023-10-31T12:00:00.000Z',
  })
  lastModified?: Date;

  @ApiProperty({
    description:
      'Pre-signed URL (not included in list responses). Use GET /signed-url/:fileKey or GET /download/:fileKey endpoints to access files.',
    example:
      'https://complytude-files.s3.eu-central-1.amazonaws.com/tenants/abc123/1698765432000-document.pdf?X-Amz-Algorithm=...',
    required: false,
  })
  url?: string;
}

export class ListFilesResponseDto {
  @ApiProperty({
    description: 'List of files',
    type: [FileListItemDto],
  })
  files: FileListItemDto[];

  @ApiProperty({
    description: 'Total number of files in this response',
    example: 5,
  })
  total: number;

  @ApiProperty({
    description: 'Token for fetching the next page of results',
    example: 'eyJNYXJrZXIiOiAiMDFDMTVGOEVGQzBEQjg1In0',
    required: false,
  })
  nextToken?: string;

  @ApiProperty({
    description: 'Whether there are more files available',
    example: true,
  })
  hasMore: boolean;
}

export class GetSignedUrlResponseDto {
  @ApiProperty({
    description: 'File key/identifier',
    example: 'tenants/abc123/1698765432000-document.pdf',
  })
  key: string;

  @ApiProperty({
    description: 'Signed URL for downloading the file',
    example:
      'https://complytude-files.s3.eu-central-1.amazonaws.com/tenants/abc123/1698765432000-document.pdf?X-Amz-Algorithm=...',
  })
  url: string;

  @ApiProperty({
    description: 'URL expiration time in seconds',
    example: 900,
  })
  expiresIn: number;
}

export class DeleteFileResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'File deleted successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Deleted file key',
    example: 'tenants/abc123/1698765432000-document.pdf',
  })
  key: string;
}
