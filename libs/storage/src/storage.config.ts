import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION!,
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  buckets: {
    filesBucketName:
      process.env.COMPLYTUDE_FILES_BUCKET_NAME || 'complytude-files',
    templatesBucketName:
      process.env.TEMPLATES_BUCKET_NAME || 'complytude-templates',
    quarantineBucketName:
      process.env.QUARANTINE_BUCKET_NAME || 'complytude-quarantine',
  },
}));
