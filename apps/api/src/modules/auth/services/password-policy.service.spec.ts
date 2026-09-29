import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService.assertNotBreached', () => {
  const password = 'correct horse battery staple';
  const sha1 = crypto
    .createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase();
  const i18n = { t: (key: string) => key } as unknown as I18nService;
  let fetchMock: jest.SpyInstance;

  function service(enabled = true): PasswordPolicyService {
    const config = {
      get: (key: string) =>
        key === 'PASSWORD_BREACH_CHECK_ENABLED' ? enabled : undefined,
    } as unknown as ConfigService;
    return new PasswordPolicyService(config, i18n);
  }

  function rangeResponse(body: string, ok = true): Response {
    return {
      ok,
      status: ok ? 200 : 503,
      text: () => Promise.resolve(body),
    } as Response;
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('sends only the first 5 characters of the hash, and refuses a breached password', async () => {
    fetchMock.mockResolvedValue(
      rangeResponse(
        `0000000000000000000000000000000000A:0\r\n${sha1.slice(5)}:42\r\n`,
      ),
    );

    await expect(service().assertNotBreached(password)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`,
      expect.anything(),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(sha1.slice(5));
  });

  it('accepts a password that is not in the range, or only as padding (count 0)', async () => {
    fetchMock.mockResolvedValue(
      rangeResponse(
        `${sha1.slice(5)}:0\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3\r\n`,
      ),
    );

    await expect(
      service().assertNotBreached(password),
    ).resolves.toBeUndefined();
  });

  it('accepts the password when the service is down or errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      service().assertNotBreached(password),
    ).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(rangeResponse('', false));
    await expect(
      service().assertNotBreached(password),
    ).resolves.toBeUndefined();
  });

  it('makes no request when turned off', async () => {
    await service(false).assertNotBreached(password);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
