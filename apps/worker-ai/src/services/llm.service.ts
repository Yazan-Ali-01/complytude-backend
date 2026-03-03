import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatCompletionOptions {
  systemPrompt: string;
  userMessage: string;
}

/** Context window sizes (in tokens) for supported OpenAI models. */
const CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
};

/** Safe fallback when the configured model is not in the map above. */
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
      throw new Error('WORKER_AI_LLM_API_KEY is required for LlmService');
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
   * Call the chat completions API expecting a JSON object response.
   * Throws on API error or if response cannot be parsed as JSON.
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<unknown> {
    const { systemPrompt, userMessage } = options;

    this.logger.debug(
      `LLM call: model=${this.model} maxTokens=${this.maxTokens}`,
    );

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response content');
    }

    const finishReason = response.choices[0].finish_reason;
    if (finishReason === 'length') {
      throw new Error(
        `LLM response truncated (finish_reason=length). Increase OPENAI_CHAT_MAX_TOKENS or reduce input size.`,
      );
    }

    this.logger.debug(
      `LLM response: finish_reason=${finishReason} usage=${JSON.stringify(response.usage)}`,
    );

    return JSON.parse(content) as unknown;
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Returns the context window size (in tokens) for the configured model.
   * Falls back to DEFAULT_CONTEXT_WINDOW for unknown models.
   */
  getContextWindowTokens(): number {
    return CONTEXT_WINDOWS[this.model] ?? DEFAULT_CONTEXT_WINDOW;
  }
}
