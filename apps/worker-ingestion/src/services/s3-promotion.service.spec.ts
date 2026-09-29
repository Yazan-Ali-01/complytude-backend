import { PermanentError, RetryableError } from '@lib/queue';
import type { S3Service } from '@lib/storage';
import { ConfigService } from '@nestjs/config';
import type { Schema } from 'joi';
import { validationSchema } from '../config/env.schema';
import { MALWARE_SCAN_TAG, S3PromotionService } from './s3-promotion.service';

describe('S3PromotionService: malware scan before promotion', () => {
  const quarantine = 'quarantine';
  const key = 'tenants/t1/documents/d1/document.pdf';

  type S3Mock = {
    headObject: jest.Mock;
    getObjectTags: jest.Mock;
    copyObject: jest.Mock;
    deleteObject: jest.Mock;
  };

  function setup(
    scanRequired: boolean,
    tags: Record<string, string>[] = [],
  ): { service: S3PromotionService; s3: S3Mock } {
    const s3: S3Mock = {
      headObject: jest.fn().mockResolvedValue({ contentLength: 10 }),
      getObjectTags: jest.fn(),
      copyObject: jest.fn().mockResolvedValue({}),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    for (const set of tags) s3.getObjectTags.mockResolvedValueOnce(set);
    s3.getObjectTags.mockResolvedValue(tags[tags.length - 1] ?? {});
    const config = new ConfigService({
      storage: { buckets: { filesBucketName: 'clean' } },
      workerIngestion: {
        malwareScanRequired: scanRequired,
        malwareScanWaitMs: 0,
      },
    });
    return {
      service: new S3PromotionService(s3 as unknown as S3Service, config),
      s3,
    };
  }

  it('promotes a file GuardDuty found clean', async () => {
    const { service, s3 } = setup(true, [
      { [MALWARE_SCAN_TAG]: 'NO_THREATS_FOUND' },
    ]);

    await expect(service.promote(quarantine, key)).resolves.toEqual({
      bucket: 'clean',
      key,
    });
    expect(s3.copyObject).toHaveBeenCalledWith(quarantine, key, 'clean', key);
  });

  it.each(['THREATS_FOUND', 'UNSUPPORTED', 'ACCESS_DENIED', 'FAILED'])(
    'never promotes a file whose scan result is %s, and does not retry it',
    async (status) => {
      const { service, s3 } = setup(true, [{ [MALWARE_SCAN_TAG]: status }]);

      await expect(service.promote(quarantine, key)).rejects.toBeInstanceOf(
        PermanentError,
      );
      expect(s3.copyObject).not.toHaveBeenCalled();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    },
  );

  it('retries later while the file has not been scanned', async () => {
    const { service, s3 } = setup(true, [{ other: 'tag' }]);

    await expect(service.promote(quarantine, key)).rejects.toBeInstanceOf(
      RetryableError,
    );
    expect(s3.copyObject).not.toHaveBeenCalled();
  });

  it('waits for a scan that finishes within the wait', async () => {
    jest.useFakeTimers();
    try {
      const { service, s3 } = setup(true, [
        {},
        { [MALWARE_SCAN_TAG]: 'NO_THREATS_FOUND' },
      ]);
      Object.assign(service, { scanWaitMs: 60000 });

      const promotion = service.promote(quarantine, key);
      await jest.advanceTimersByTimeAsync(5000);

      await expect(promotion).resolves.toMatchObject({ bucket: 'clean' });
      expect(s3.getObjectTags).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not read tags where no scanner runs (local development)', async () => {
    const { service, s3 } = setup(false);

    await service.promote(quarantine, key);

    expect(s3.getObjectTags).not.toHaveBeenCalled();
    expect(s3.copyObject).toHaveBeenCalled();
  });

  it('is required in production (and on by default there), off by default elsewhere', () => {
    // Only the two keys under test; the rest of the worker's env is not what this checks
    const schema = validationSchema.fork(
      Object.keys(
        validationSchema.describe().keys as Record<string, unknown>,
      ).filter((k) => !['NODE_ENV', 'MALWARE_SCAN_REQUIRED'].includes(k)),
      (key: Schema) => key.optional(),
    );
    const check = (env: Record<string, string>) =>
      schema.validate(env, { allowUnknown: true });

    expect(
      check({ NODE_ENV: 'production', MALWARE_SCAN_REQUIRED: 'false' }).error,
    ).toBeDefined();
    expect(check({ NODE_ENV: 'production' }).value).toMatchObject({
      MALWARE_SCAN_REQUIRED: true,
    });
    expect(check({ NODE_ENV: 'development' }).value).toMatchObject({
      MALWARE_SCAN_REQUIRED: false,
    });
  });
});
