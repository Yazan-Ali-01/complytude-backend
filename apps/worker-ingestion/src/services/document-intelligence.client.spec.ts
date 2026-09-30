import { PermanentError, RetryableError } from '@lib/queue';
import { OcrOperationLostError } from '../interfaces/ocr.interface';
import { DocumentIntelligenceClient } from './document-intelligence.client';

const ENDPOINT = 'https://docintel.cognitiveservices.azure.com/';
const KEY = 'k'.repeat(84);
const MODELS =
  'https://docintel.cognitiveservices.azure.com/documentintelligence/documentModels';
const RESULT_URL = `${MODELS}/prebuilt-layout/analyzeResults/3b31320d-8bab-4f88-b19c-2322a7f11034?api-version=2024-11-30`;

function reply(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

describe('DocumentIntelligenceClient', () => {
  let fetchFn: jest.Mock<Promise<Response>, Parameters<typeof fetch>>;
  let client: DocumentIntelligenceClient;

  beforeEach(() => {
    fetchFn = jest.fn();
    client = new DocumentIntelligenceClient(
      ENDPOINT,
      KEY,
      fetchFn as unknown as typeof fetch,
    );
  });

  function sent(call = 0): { url: string; init: RequestInit } {
    const [url, init] = fetchFn.mock.calls[call];
    // The client always passes the URL as a string
    return { url: url as string, init: init! };
  }

  it('sends the PDF as bytes to prebuilt-layout and returns the result ID', async () => {
    fetchFn.mockResolvedValue(
      reply(202, undefined, { 'Operation-Location': RESULT_URL }),
    );
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await expect(client.analyze(pdf)).resolves.toBe(
      '3b31320d-8bab-4f88-b19c-2322a7f11034',
    );

    const { url, init } = sent();
    expect(url).toBe(
      `${MODELS}/prebuilt-layout:analyze?api-version=2024-11-30`,
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/json',
    });
    const body = JSON.parse(init.body as string) as { base64Source: string };
    expect(Buffer.from(body.base64Source, 'base64')).toEqual(Buffer.from(pdf));
  });

  it('fails a document the service refuses for good, and retries anything else', async () => {
    fetchFn.mockResolvedValueOnce(
      reply(400, { error: { code: 'InvalidRequest', message: 'Corrupt' } }),
    );
    const refused = await client
      .analyze(new Uint8Array([1]))
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PermanentError);
    expect((refused as Error).message).toBe(
      'Document Intelligence analyze: HTTP 400 InvalidRequest: Corrupt',
    );

    for (const status of [401, 429, 500, 503]) {
      fetchFn.mockResolvedValueOnce(reply(status, { error: {} }));
      const error = await client
        .analyze(new Uint8Array([1]))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RetryableError);
      expect(error).not.toBeInstanceOf(PermanentError);
    }

    fetchFn.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.analyze(new Uint8Array([1]))).rejects.toBeInstanceOf(
      RetryableError,
    );

    fetchFn.mockResolvedValueOnce(reply(202));
    await expect(client.analyze(new Uint8Array([1]))).rejects.toThrow(
      /named no operation/,
    );
  });

  it('never puts the key in an error', async () => {
    fetchFn.mockResolvedValue(reply(401, { error: { code: 'Unauthorized' } }));

    const error = (await client
      .analyze(new Uint8Array([1]))
      .catch((e: unknown) => e)) as Error;

    expect(error.message).not.toContain(KEY);
  });

  it('reads a result, and reports one that is gone as an operation to start again', async () => {
    fetchFn.mockResolvedValueOnce(reply(200, { status: 'running' }));
    await expect(client.getResult('result 1')).resolves.toEqual({
      status: 'running',
    });
    expect(sent().url).toBe(
      `${MODELS}/prebuilt-layout/analyzeResults/result%201?api-version=2024-11-30`,
    );
    expect(sent().init.method).toBe('GET');

    fetchFn.mockResolvedValueOnce(reply(404, { error: { code: 'NotFound' } }));
    await expect(client.getResult('result-1')).rejects.toBeInstanceOf(
      OcrOperationLostError,
    );
  });

  it('deletes a result; one already gone is fine', async () => {
    fetchFn.mockResolvedValueOnce(reply(204));
    await client.deleteResult('result-1');
    expect(sent().url).toBe(
      `${MODELS}/prebuilt-layout/analyzeResults/result-1?api-version=2024-11-30`,
    );
    expect(sent().init.method).toBe('DELETE');

    fetchFn.mockResolvedValueOnce(reply(404));
    await expect(client.deleteResult('result-1')).resolves.toBeUndefined();

    fetchFn.mockResolvedValueOnce(reply(500));
    await expect(client.deleteResult('result-1')).rejects.toBeInstanceOf(
      RetryableError,
    );
  });

  it('refuses to send anything without an endpoint and key', async () => {
    const unconfigured = new DocumentIntelligenceClient(
      '',
      '',
      fetchFn as unknown as typeof fetch,
    );

    await expect(
      unconfigured.analyze(new Uint8Array([1])),
    ).rejects.toBeInstanceOf(PermanentError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
