import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  s3: {
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    region: process.env.S3_REGION!,
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  bucket: {
    filesBucketName: process.env.COMPLYTUDE_FILES_BUCKET_NAME!,
  },
  quarantine: {
    bucketName: process.env.QUARANTINE_BUCKET_NAME!,
  },
  templates: {
    bucketName: process.env.TEMPLATES_BUCKET_NAME!,
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    ],
    maxFileSize: parseInt(process.env.TEMPLATE_MAX_FILE_SIZE!, 10), // 5MB default
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE!, 10),
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'image/png',
      'image/jpeg',
    ],
  },
  signedUrl: {
    expiresIn: parseInt(process.env.SIGNED_URL_EXPIRES_IN!, 10),
  },
}));
