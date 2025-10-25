import { ApiProperty } from '@nestjs/swagger';

export class FileResponseDto {
  @ApiProperty({
    description: 'File key/identifier in storage',
    example: '1698765432000-document.pdf',
  })
  key: string;

  @ApiProperty({
    description: 'Bucket name where file is stored',
    example: 'complytude-tenant-123',
  })
  bucket: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  size: number;

  @ApiProperty({
    description: 'File MIME type',
    example: 'application/pdf',
  })
  contentType: string;

  @ApiProperty({
    description: 'Signed URL for accessing the file',
    example: 'https://minio.example.com/bucket/file?signature=...',
  })
  url: string;
}

export class FileListItemDto {
  @ApiProperty({
    description: 'File key/identifier in storage',
    example: '1698765432000-document.pdf',
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
  lastModified: Date;

  @ApiProperty({
    description: 'Signed URL for accessing the file',
    example: 'https://minio.example.com/bucket/file?signature=...',
  })
  url: string;
}

export class FileListResponseDto {
  @ApiProperty({
    description: 'List of files',
    type: [FileListItemDto],
  })
  files: FileListItemDto[];

  @ApiProperty({
    description: 'Total number of files',
    example: 5,
  })
  total: number;
}

export class SignedUrlResponseDto {
  @ApiProperty({
    description: 'File key/identifier',
    example: '1698765432000-document.pdf',
  })
  key: string;

  @ApiProperty({
    description: 'Signed URL for downloading the file',
    example: 'https://minio.example.com/bucket/file?signature=...',
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
    example: '1698765432000-document.pdf',
  })
  key: string;
}
