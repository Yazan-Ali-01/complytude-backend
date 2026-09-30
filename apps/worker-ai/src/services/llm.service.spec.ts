import { ConfigService } from '@nestjs/config';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import { LlmService } from './llm.service';

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

const SCHEMA: ResponseFormatJSONSchema.JSONSchema = {
  name: 'analysis_result',
  strict: true,
  schema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  },
};

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  } as unknown as ConfigService;
}

describe('LlmService', () => {
  let requests: CapturedRequest[];

  beforeEach(() => {
    requests = [];
    // The SDK takes the global fetch when the client is built, so stub it first
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (input: string | URL | Request, init?: RequestInit) => {
          requests.push({
            url: input instanceof Request ? input.url : String(input),
            body: JSON.parse(
              typeof init?.body === 'string' ? init.body : '{}',
            ) as Record<string, unknown>,
          });
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'chatcmpl-1',
                object: 'chat.completion',
                created: 0,
                model: 'test',
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: {
                      role: 'assistant',
                      content: '{"summary":"ok"}',
                      refusal: null,
                    },
                  },
                ],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          );
        },
      );
  });

  afterEach(() => jest.restoreAllMocks());

  async function call(values: Record<string, unknown>): Promise<unknown> {
    const service = new LlmService(
      config({ 'workerAi.llmApiKey': 'sk-test-key', ...values }),
    );
    return service.chatCompletion({
      systemPrompt: 'system',
      userMessage: 'user',
      responseSchema: SCHEMA,
    });
  }

  it('sends to OPENAI_BASE_URL, with max_completion_tokens and no temperature for an unknown model', async () => {
    await expect(
      call({
        'workerAi.llmBaseUrl': 'https://ae.api.openai.com/v1',
        'workerAi.llmModel': 'gpt-5.2-2025-12-11',
        'workerAi.llmContextWindow': 400_000,
        'workerAi.llmMaxTokens': 16_000,
      }),
    ).resolves.toEqual({
      data: { summary: 'ok' },
      usage: { promptTokens: 0, completionTokens: 0 },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      'https://ae.api.openai.com/v1/chat/completions',
    );
    expect(requests[0].body).toMatchObject({
      model: 'gpt-5.2-2025-12-11',
      max_completion_tokens: 16_000,
    });
    expect(requests[0].body).not.toHaveProperty('max_tokens');
    expect(requests[0].body).not.toHaveProperty('temperature');
  });

  it('keeps the default endpoint and a low temperature for the default model', async () => {
    await call({});

    expect(requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(requests[0].body).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_completion_tokens: 4096,
    });
  });

  it('refuses to start with an unknown model and no context window', () => {
    expect(
      () =>
        new LlmService(
          config({
            'workerAi.llmApiKey': 'sk-test-key',
            'workerAi.llmModel': 'gpt-5.6-luna',
          }),
        ),
    ).toThrow('OPENAI_CHAT_CONTEXT_WINDOW');
  });

  it('reports the model limits the prompt budget needs', () => {
    const service = new LlmService(
      config({
        'workerAi.llmApiKey': 'sk-test-key',
        'workerAi.llmModel': 'gpt-4o-2024-08-06',
        'workerAi.llmMaxTokens': 8_000,
      }),
    );

    expect(service.getContextWindowTokens()).toBe(128_000);
    expect(service.getMaxOutputTokens()).toBe(8_000);
    expect(service.getTokenEncoding()).toBe('o200k_base');
  });
});
