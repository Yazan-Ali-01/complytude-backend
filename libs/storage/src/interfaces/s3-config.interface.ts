export interface S3Config {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface StorageBucketsConfig {
  filesBucketName: string;
  templatesBucketName: string;
  quarantineBucketName: string;
}

export interface HeadObjectResult {
  contentLength: number;
  contentType: string | undefined;
  lastModified: Date | undefined;
  metadata: Record<string, string> | undefined;
}

export interface CopyObjectResult {
  bucket: string;
  key: string;
}
