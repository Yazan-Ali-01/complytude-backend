import type { TokenEncoding } from '@lib/embedding';

interface KnownChatModel {
  contextWindow: number;
  encoding: TokenEncoding;
  /** Reasoning models reject a temperature, and spend output tokens on their reasoning. */
  reasoning?: boolean;
}

/**
 * Chat models whose limits we know; a dated snapshot (`gpt-4o-2024-08-06`) resolves to its base
 * name. Any other model needs OPENAI_CHAT_CONTEXT_WINDOW, and is sent no temperature unless
 * OPENAI_CHAT_TEMPERATURE is set, because reasoning models reject one.
 */
const KNOWN_CHAT_MODELS: Record<string, KnownChatModel> = {
  // D-8's OpenAI UAE data-residency models (reasoning models)
  'gpt-5.6-luna': {
    contextWindow: 1_050_000,
    encoding: 'o200k_base',
    reasoning: true,
  },
  'gpt-5.5': {
    contextWindow: 1_050_000,
    encoding: 'o200k_base',
    reasoning: true,
  },
  'gpt-5.2': {
    contextWindow: 400_000,
    encoding: 'o200k_base',
    reasoning: true,
  },
  'gpt-4o': { contextWindow: 128_000, encoding: 'o200k_base' },
  'gpt-4o-mini': { contextWindow: 128_000, encoding: 'o200k_base' },
  'gpt-4-turbo': { contextWindow: 128_000, encoding: 'cl100k_base' },
  'gpt-4': { contextWindow: 8_192, encoding: 'cl100k_base' },
  'gpt-3.5-turbo': { contextWindow: 16_385, encoding: 'cl100k_base' },
};

const DATED_SNAPSHOT = /-\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_CHAT_TEMPERATURE = 0.1;
/** Output budget when OPENAI_CHAT_MAX_TOKENS is unset; a reasoning model's reasoning counts too. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_REASONING_MAX_OUTPUT_TOKENS = 32_000;

/** A known model name, with or without a dated snapshot suffix. */
export const KNOWN_CHAT_MODEL_PATTERN = new RegExp(
  `^(?:${Object.keys(KNOWN_CHAT_MODELS)
    .map((name) => name.replace(/\./g, '\\.'))
    .join('|')})(?:-\\d{4}-\\d{2}-\\d{2})?$`,
);

export interface ChatModelSettings {
  contextWindow: number;
  encoding: TokenEncoding;
  /** Left out of the request when undefined. */
  temperature?: number;
  maxOutputTokens: number;
}

export function resolveChatModel(
  model: string,
  overrides: {
    contextWindow?: number;
    temperature?: number;
    maxOutputTokens?: number;
  },
): ChatModelSettings {
  const known = KNOWN_CHAT_MODELS[model.replace(DATED_SNAPSHOT, '')];
  if (known?.reasoning) {
    return {
      contextWindow: overrides.contextWindow ?? known.contextWindow,
      encoding: known.encoding,
      // Never sent: the API rejects a temperature for a reasoning model
      temperature: undefined,
      maxOutputTokens:
        overrides.maxOutputTokens ?? DEFAULT_REASONING_MAX_OUTPUT_TOKENS,
    };
  }
  if (known) {
    return {
      contextWindow: overrides.contextWindow ?? known.contextWindow,
      encoding: known.encoding,
      temperature: overrides.temperature ?? DEFAULT_CHAT_TEMPERATURE,
      maxOutputTokens: overrides.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    };
  }

  if (!overrides.contextWindow) {
    throw new Error(
      `Unknown chat model "${model}": set OPENAI_CHAT_CONTEXT_WINDOW to its context window in tokens`,
    );
  }

  return {
    contextWindow: overrides.contextWindow,
    // Every OpenAI chat model since gpt-4o tokenises with o200k_base
    encoding: 'o200k_base',
    temperature: overrides.temperature,
    maxOutputTokens: overrides.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}
