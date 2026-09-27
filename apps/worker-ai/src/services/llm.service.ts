import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';

export interface ChatCompletionOptions {
  systemPrompt: string;
  userMessage: string;
  responseSchema: ResponseFormatJSONSchema.JSONSchema;
}

/** Context window sizes (in tokens) for supported OpenAI models. */
const CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
};

const DEFAULT_CONTEXT_WINDOW = 16_000;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('workerAi.llmApiKey');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for LlmService');
    }

    this.model = this.configService.get<string>(
      'workerAi.llmModel',
      'gpt-4o-mini',
    );
    this.maxTokens = this.configService.get<number>(
      'workerAi.llmMaxTokens',
      4096,
    );
    this.temperature = this.configService.get<number>(
      'workerAi.llmTemperature',
      0.1,
    );
    this.timeout = this.configService.get<number>(
      'workerAi.llmTimeout',
      120000,
    );

    this.client = new OpenAI({ apiKey, timeout: this.timeout });

    this.logger.log(`LlmService initialized with model=${this.model}`);
  }

  /**
   * Call the chat completions API with structured output enforcement.
   * The response is guaranteed by OpenAI to match the provided JSON Schema.
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<unknown> {
    const { systemPrompt, userMessage, responseSchema } = options;

    this.logger.debug(
      `LLM call: model=${this.model} maxTokens=${this.maxTokens} schema=${responseSchema.name}`,
    );

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: responseSchema,
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const choice = response.choices[0];
    const content = choice?.message?.content;

    if (choice?.message?.refusal) {
      throw new Error(`LLM refused the request: ${choice.message.refusal}`);
    }

    if (!content) {
      throw new Error('LLM returned empty response content');
    }

    if (choice.finish_reason === 'length') {
      throw new Error(
        'LLM response truncated (finish_reason=length). Increase OPENAI_CHAT_MAX_TOKENS or reduce input size.',
      );
    }

    this.logger.debug(
      `LLM response: finish_reason=${choice.finish_reason} usage=${JSON.stringify(response.usage)}`,
    );

    return JSON.parse(content) as unknown;
  }

  getModel(): string {
    return this.model;
  }

  getContextWindowTokens(): number {
    return CONTEXT_WINDOWS[this.model] ?? DEFAULT_CONTEXT_WINDOW;
  }
}
