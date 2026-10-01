import * as Joi from 'joi';
import { TokenCounterService } from './chunking/token-counter.service';
import { openAiRegion } from './embedding.constants';
import { embeddingEnvSchema } from './embedding.schema';
import { EmbeddingService, embeddingBatches } from './embedding.service';

/** The SDK asks for base64 embeddings and decodes them: 4-byte little-endian floats. */
function base64Floats(values: number[]): string {
  return Buffer.from(new Float32Array(values).buffer).toString('base64');
}

describe('EmbeddingService', () => {
  const tokenCounter = new TokenCounterService();
  let urls: string[];
  const envBaseUrl = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    urls = [];
    // The SDK takes the global fetch when the client is built, so stub it first
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (input: string | URL | Request, init?: RequestInit) => {
          urls.push(input instanceof Request ? input.url : String(input));
          const body = JSON.parse(
            typeof init?.body === 'string' ? init.body : '{}',
          ) as {
            input: string | string[];
          };
          const texts = Array.isArray(body.input) ? body.input : [body.input];
          return Promise.resolve(
            new Response(
              JSON.stringify({
                object: 'list',
                model: 'text-embedding-3-small',
                data: texts.map((_text, index) => ({
                  object: 'embedding',
                  index,
                  embedding: base64Floats([0.5, index]),
                })),
                usage: { prompt_tokens: 1, total_tokens: 1 },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        },
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (envBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = envBaseUrl;
  });

  afterAll(() => tokenCounter.onModuleDestroy());

  it('sends to the configured OpenAI host', async () => {
    const service = new EmbeddingService(
      { apiKey: 'sk-test-key', baseURL: 'https://ae.api.openai.com/v1' },
      tokenCounter,
    );

    const results = await service.generateEmbeddings(['first', 'second']);

    expect(urls).toEqual(['https://ae.api.openai.com/v1/embeddings']);
    expect(results.map((r) => r.embedding)).toEqual([
      [0.5, 0],
      [0.5, 1],
    ]);
  });

  it('never falls back to an unvalidated OPENAI_BASE_URL from the process', async () => {
    process.env.OPENAI_BASE_URL = 'https://llm-proxy.example.com/v1';
    const service = new EmbeddingService(
      { apiKey: 'sk-test-key' },
      tokenCounter,
    );

    await service.generateEmbedding('text');

    expect(urls).toEqual(['https://api.openai.com/v1/embeddings']);
  });
});

describe('OPENAI_BASE_URL validation', () => {
  const schema = Joi.object(embeddingEnvSchema);

  function validate(url?: string): Joi.ValidationResult {
    return schema.validate({
      OPENAI_API_KEY: 'sk-test-key',
      ...(url !== undefined && { OPENAI_BASE_URL: url }),
    });
  }

  it('defaults to the global API', () => {
    expect(validate().value).toMatchObject({
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
  });

  it.each([
    'https://api.openai.com/v1',
    'https://us.api.openai.com/v1',
    'https://eu.api.openai.com/v1',
    'https://ae.api.openai.com/v1',
  ])('accepts %s', (url) => {
    expect(validate(url).error).toBeUndefined();
  });

  it.each([
    'http://api.openai.com/v1',
    'https://llm-proxy.example.com/v1',
    'https://api.openai.com.example.com/v1',
    'https://fr.api.openai.com/v1',
    'https://api.openai.com/v1/../proxy',
  ])('refuses %s', (url) => {
    expect(validate(url).error?.message).toContain('OPENAI_BASE_URL');
  });
});

describe('openAiRegion', () => {
  it('names the data-residency region of an OpenAI host, global otherwise', () => {
    expect(openAiRegion('https://api.openai.com/v1')).toBe('global');
    expect(openAiRegion('https://ae.api.openai.com/v1')).toBe('ae');
    expect(openAiRegion('https://eu.api.openai.com/v1')).toBe('eu');
    expect(openAiRegion('https://us.api.openai.com/v1')).toBe('us');
  });
});

describe('embeddingBatches', () => {
  it('keeps a batch under the token cap as well as the input cap', () => {
    // 4 inputs of 120k tokens: two fit under 300k, the third would not
    expect(embeddingBatches([120_000, 120_000, 120_000, 120_000])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('caps the number of inputs per batch', () => {
    expect(embeddingBatches([1, 1, 1, 1, 1], 2, 300_000)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
  });

  it('never splits an input or makes an empty batch', () => {
    expect(embeddingBatches([8_000], 2048, 5_000)).toEqual([
      { start: 0, end: 1 },
    ]);
    expect(embeddingBatches([])).toEqual([]);
  });
});
