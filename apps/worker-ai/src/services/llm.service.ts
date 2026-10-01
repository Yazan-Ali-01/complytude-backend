import { DEFAULT_OPENAI_BASE_URL, type TokenEncoding } from '@lib/embedding';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ResponseFormatJSONSchema } from 'openai/resources/shared';
import { ChatModelSettings, resolveChatModel } from '../config/chat-model';

export interface ChatCompletionOptions {
  systemPrompt: string;
  userMessage: string;
  responseSchema: ResponseFormatJSONSchema.JSONSchema;
}

export interface ChatCompletionResult {
  /** The parsed JSON answer (matching the response schema). */
  data: unknown;
  /** Tokens billed for the call, for metering. */
  usage: { promptTokens: number; completionTokens: number };
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly settings: ChatModelSettings;
  private readonly maxTokens: number;
  private readonly timeout: number;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('workerAi.llmApiKey');

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for LlmService');
    }

    this.model = this.configService.get<string>(
      'workerAi.llmModel',
      'gpt-4o-mini',
    );
    this.settings = resolveChatModel(this.model, {
      contextWindow: this.configService.get<number>(
        'workerAi.llmContextWindow',
      ),
      temperature: this.configService.get<number>('workerAi.llmTemperature'),
      maxOutputTokens: this.configService.get<number>('workerAi.llmMaxTokens'),
    });
    this.maxTokens = this.settings.maxOutputTokens;
    this.timeout = this.configService.get<number>(
      'workerAi.llmTimeout',
      120000,
    );
    const baseURL = this.configService.get<string>(
      'workerAi.llmBaseUrl',
      DEFAULT_OPENAI_BASE_URL,
    );
    this.baseUrl = baseURL;

    this.client = new OpenAI({ apiKey, baseURL, timeout: this.timeout });

    this.logger.log(
      `LlmService initialized with model=${this.model} contextWindow=${this.settings.contextWindow} baseURL=${baseURL}`,
    );
  }

  /**
   * Call the chat completions API with structured output enforcement.
   * The response is guaranteed by OpenAI to match the provided JSON Schema.
   */
  async chatCompletion(
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const { systemPrompt, userMessage, responseSchema } = options;

    this.logger.debug(
      `LLM call: model=${this.model} maxTokens=${this.maxTokens} schema=${responseSchema.name}`,
    );

    const response = await this.client.chat.completions.create({
      model: this.model,
      // max_tokens is deprecated, and reasoning models accept only max_completion_tokens
      max_completion_tokens: this.maxTokens,
      ...(this.settings.temperature !== undefined && {
        temperature: this.settings.temperature,
      }),
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
        'LLM response truncated (finish_reason=length). Increase OPENAI_CHAT_MAX_TOKENS (reasoning models count their reasoning tokens against it) or reduce input size.',
      );
    }

    this.logger.debug(
      `LLM response: finish_reason=${choice.finish_reason} usage=${JSON.stringify(response.usage)}`,
    );

    return {
      data: JSON.parse(content) as unknown,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  /** The OpenAI host chat requests are sent to (validated by OPENAI_BASE_URL_PATTERN). */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  getModel(): string {
    return this.model;
  }

  getContextWindowTokens(): number {
    return this.settings.contextWindow;
  }

  getMaxOutputTokens(): number {
    return this.maxTokens;
  }

  /** The tokenizer of the chat model, for counting prompt tokens. */
  getTokenEncoding(): TokenEncoding {
    return this.settings.encoding;
  }
}
