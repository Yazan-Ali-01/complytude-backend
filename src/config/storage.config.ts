import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' || true, // Required for MinIO
  },
  bucket: {
    prefix: process.env.S3_BUCKET_PREFIX || 'complytude',
  },
  templates: {
    bucketName: process.env.TEMPLATES_BUCKET_NAME || 'complytude-templates',
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    ],
    maxFileSize: parseInt(process.env.TEMPLATE_MAX_FILE_SIZE || '5242880', 10), // 5MB default
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'image/png',
      'image/jpeg',
    ],
  },
  signedUrl: {
    expiresIn: parseInt(process.env.SIGNED_URL_EXPIRES_IN || '900', 10), // 15 minutes default
  },
}));
