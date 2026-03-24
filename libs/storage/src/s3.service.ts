import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import type {
  CopyObjectResult,
  HeadObjectResult,
} from './interfaces/s3-config.interface';
import { S3_CLIENT } from './storage.constants';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  constructor(@Inject(S3_CLIENT) private readonly s3Client: S3Client) {}

  async headObject(
    bucket: string,
    key: string,
  ): Promise<HeadObjectResult | null> {
    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getObjectStream(bucket: string, key: string): Promise<Readable> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`Empty body for s3://${bucket}/${key}`);
    }
    return response.Body as Readable;
  }

  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
      );
    }
    return Buffer.concat(chunks);
  }

  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<CopyObjectResult> {
    await this.s3Client.send(
      new CopyObjectCommand({
        CopySource: `${sourceBucket}/${sourceKey}`,
        Bucket: destBucket,
        Key: destKey,
      }),
    );
    return { bucket: destBucket, key: destKey };
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) return false;
      throw error;
    }
  }

  async createBucketIfNotExists(bucket: string): Promise<void> {
    const exists = await this.bucketExists(bucket);
    if (exists) return;
    await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    this.logger.log(`Created bucket: ${bucket}`);
  }

  private isNotFoundError(error: unknown): boolean {
    const err = error as Record<string, unknown> & {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      err.name === 'NoSuchKey' ||
      err.name === 'NotFound' ||
      err.name === 'NoSuchBucket' ||
      err.$metadata?.httpStatusCode === 404
    );
  }
}
