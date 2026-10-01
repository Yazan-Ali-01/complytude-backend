import {
  DEFAULT_CHAT_TEMPERATURE,
  DEFAULT_REASONING_MAX_OUTPUT_TOKENS,
  resolveChatModel,
} from './chat-model';
import { validationSchema } from './env.schema';

const BASE: Record<string, string> = {
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'complytude',
  DB_APP_USER: 'app_login',
  DB_APP_PASSWORD: 'Vq3r8KxZp2Lm9Wt4Ys6N',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  OPENAI_API_KEY: 'sk-proj-0123456789abcdefghijklmn',
};

function errors(env: Record<string, string>): string[] {
  const { error } = validationSchema.validate(
    { ...BASE, ...env },
    { abortEarly: false },
  );
  return error?.details.map((detail) => detail.message) ?? [];
}

describe('chat model configuration', () => {
  describe('env schema', () => {
    it('needs no context window for the default model', () => {
      expect(errors({})).toEqual([]);
    });

    it('needs no context window for a dated snapshot of a known model', () => {
      expect(errors({ OPENAI_CHAT_MODEL: 'gpt-4o-2024-08-06' })).toEqual([]);
    });

    it("needs no context window for D-8's models", () => {
      expect(errors({ OPENAI_CHAT_MODEL: 'gpt-5.6-luna' })).toEqual([]);
      expect(errors({ OPENAI_CHAT_MODEL: 'gpt-5.2-2025-12-11' })).toEqual([]);
    });

    it('refuses an unknown model without a context window', () => {
      expect(errors({ OPENAI_CHAT_MODEL: 'gpt-6-luna-2026-09-01' })).toEqual([
        expect.stringContaining('"OPENAI_CHAT_CONTEXT_WINDOW" is required'),
      ]);
    });

    it('accepts an unknown model with a context window', () => {
      expect(
        errors({
          OPENAI_CHAT_MODEL: 'gpt-6-luna-2026-09-01',
          OPENAI_CHAT_CONTEXT_WINDOW: '400000',
        }),
      ).toEqual([]);
    });

    it('refuses a temperature outside 0–2', () => {
      expect(errors({ OPENAI_CHAT_TEMPERATURE: '3' })).toEqual([
        expect.stringContaining('OPENAI_CHAT_TEMPERATURE'),
      ]);
    });

    it('refuses an OpenAI base URL that is not an OpenAI host', () => {
      expect(
        errors({ OPENAI_BASE_URL: 'https://llm-proxy.example.com/v1' }),
      ).toEqual([expect.stringContaining('OPENAI_BASE_URL')]);
    });
  });

  describe('resolveChatModel', () => {
    it('resolves a known snapshot to its base model', () => {
      expect(resolveChatModel('gpt-4o-mini-2024-07-18', {})).toEqual({
        contextWindow: 128_000,
        encoding: 'o200k_base',
        temperature: DEFAULT_CHAT_TEMPERATURE,
        maxOutputTokens: 4096,
      });
    });

    it('keeps the older tokenizer for pre-gpt-4o models', () => {
      expect(resolveChatModel('gpt-4-turbo', {}).encoding).toBe('cl100k_base');
    });

    it('throws for an unknown model without a context window', () => {
      expect(() => resolveChatModel('gpt-6-luna', {})).toThrow(
        'OPENAI_CHAT_CONTEXT_WINDOW',
      );
    });

    it("knows D-8's reasoning models: never a temperature, a larger output budget", () => {
      expect(resolveChatModel('gpt-5.6-luna', { temperature: 0.1 })).toEqual({
        contextWindow: 1_050_000,
        encoding: 'o200k_base',
        temperature: undefined,
        maxOutputTokens: DEFAULT_REASONING_MAX_OUTPUT_TOKENS,
      });
      expect(resolveChatModel('gpt-5.2-2025-12-11', {})).toMatchObject({
        contextWindow: 400_000,
        temperature: undefined,
      });
      expect(
        resolveChatModel('gpt-5.5-2026-04-23', { maxOutputTokens: 64_000 })
          .maxOutputTokens,
      ).toBe(64_000);
    });

    it('sends no temperature to an unknown model unless one is configured', () => {
      expect(
        resolveChatModel('gpt-6-luna', { contextWindow: 400_000 }),
      ).toEqual({
        contextWindow: 400_000,
        encoding: 'o200k_base',
        temperature: undefined,
        maxOutputTokens: 4096,
      });
      expect(
        resolveChatModel('gpt-6-luna', {
          contextWindow: 400_000,
          temperature: 0,
        }).temperature,
      ).toBe(0);
    });
  });
});
