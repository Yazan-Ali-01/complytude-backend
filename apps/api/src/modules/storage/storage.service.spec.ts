import type { ConfigService } from '@nestjs/config';
import type { I18nService } from 'nestjs-i18n';
import { attachmentDisposition, StorageService } from './storage.service';

describe('attachmentDisposition', () => {
  it('keeps an ASCII name as it is', () => {
    expect(attachmentDisposition('lease 2026.pdf')).toBe(
      `attachment; filename="lease 2026.pdf"; filename*=UTF-8''lease%202026.pdf`,
    );
  });

  it('gives an Arabic name exactly in filename*, with an ASCII fallback', () => {
    const header = attachmentDisposition('عقد.pdf');

    expect(header).toBe(
      `attachment; filename="___.pdf"; filename*=UTF-8''${encodeURIComponent('عقد.pdf')}`,
    );
    expect(decodeURIComponent(header.split("UTF-8''")[1])).toBe('عقد.pdf');
  });

  it('cannot be used to break out of the header value', () => {
    const header = attachmentDisposition('a"; filename="evil.html\r\nX: y');

    expect(header).not.toMatch(/[\r\n]/);
    expect(
      header.startsWith(
        'attachment; filename="a_; filename=_evil.html__X: y";',
      ),
    ).toBe(true);
  });
});

describe('StorageService bucket creation', () => {
  function storage(nodeEnv: string): {
    service: StorageService;
    send: jest.Mock;
  } {
    const values: Record<string, unknown> = {
      'storage.s3': { region: 'me-central-1', forcePathStyle: false },
      NODE_ENV: nodeEnv,
    };
    const config = { get: (key: string) => values[key] };
    const service = new StorageService(
      config as unknown as ConfigService,
      {} as I18nService,
    );
    const send = jest.fn().mockRejectedValue({ name: 'NotFound' });
    (service as unknown as { s3Client: { send: jest.Mock } }).s3Client.send =
      send;
    return { service, send };
  }

  it('never creates (or even looks for) a bucket in production: Terraform owns them', async () => {
    const { service, send } = storage('production');

    await service.initializeQuarantineBucket();
    await service.initializeTenantFilesBucket();

    expect(send).not.toHaveBeenCalled();
  });

  it('creates a missing bucket elsewhere (local S3 emulators)', async () => {
    const { service, send } = storage('development');
    send
      .mockRejectedValueOnce({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      })
      .mockResolvedValueOnce({});

    await service.initializeQuarantineBucket();

    expect(
      send.mock.calls.map(([command]) => command.constructor.name),
    ).toEqual(['HeadBucketCommand', 'CreateBucketCommand']);
  });
});
