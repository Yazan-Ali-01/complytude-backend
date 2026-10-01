import { DEFAULT_OPENAI_BASE_URL } from '@lib/embedding';
import { registerAs } from '@nestjs/config';

export default registerAs('workerAi', () => ({
  // Worker-specific settings
  port: parseInt(process.env.WORKER_AI_PORT || '3001', 10),
  environment: process.env.NODE_ENV || 'development',

  // Queue configuration
  concurrency: parseInt(process.env.WORKER_AI_CONCURRENCY || '5', 10),
  maxRetries: parseInt(process.env.WORKER_AI_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.WORKER_AI_RETRY_DELAY || '5000', 10),

  // Processing limits
  maxProcessingTime: parseInt(
    process.env.WORKER_AI_MAX_PROCESSING_TIME || '300000',
    10,
  ), // 5 minutes

  // LLM (OpenAI Chat) configuration
  llmApiKey: process.env.OPENAI_API_KEY!,
  llmBaseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  llmModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  llmContextWindow: process.env.OPENAI_CHAT_CONTEXT_WINDOW
    ? parseInt(process.env.OPENAI_CHAT_CONTEXT_WINDOW, 10)
    : undefined,
  llmMaxTokens: parseInt(process.env.OPENAI_CHAT_MAX_TOKENS || '4096', 10),
  llmTemperature: process.env.OPENAI_CHAT_TEMPERATURE
    ? parseFloat(process.env.OPENAI_CHAT_TEMPERATURE)
    : undefined,
  llmTimeout: parseInt(process.env.OPENAI_CHAT_TIMEOUT || '120000', 10),

  // Redaction of personal data before any AI provider call
  redactionEnabled: process.env.REDACTION_ENABLED !== 'false',
  redactionNerUrl: process.env.REDACTION_NER_URL || undefined,
  redactionNerLanguages: (process.env.REDACTION_NER_LANGUAGES || 'en').split(
    ',',
  ),
  redactionNerTimeoutMs: parseInt(
    process.env.REDACTION_NER_TIMEOUT_MS || '10000',
    10,
  ),

  // Most clauses taken by similarity after the required ones
  ragOptionalClauseLimit: parseInt(
    process.env.RAG_OPTIONAL_CLAUSE_LIMIT || '25',
    10,
  ),

  // RAG retrieval tuning
  ragTopKPerQuery: parseInt(process.env.RAG_TOP_K_PER_QUERY || '5', 10),
  ragVectorLimit: parseInt(process.env.RAG_VECTOR_LIMIT || '30', 10),
  ragBm25Limit: parseInt(process.env.RAG_BM25_LIMIT || '30', 10),
  ragMaxHybridResults: parseInt(process.env.RAG_MAX_HYBRID_RESULTS || '40', 10),
  ragJudgeBatchSize: parseInt(process.env.RAG_JUDGE_BATCH_SIZE || '8', 10),
  ragJudgeConcurrency: parseInt(process.env.RAG_JUDGE_CONCURRENCY || '3', 10),
  ragMaxJudgeCalls: parseInt(process.env.RAG_MAX_JUDGE_CALLS || '10', 10),
  ragSectionsPerClause: parseInt(
    process.env.RAG_SECTIONS_PER_CLAUSE || '4',
    10,
  ),

  // Resource limits
  memoryLimit: process.env.WORKER_AI_MEMORY_LIMIT || '2GB',
  cpuLimit: process.env.WORKER_AI_CPU_LIMIT || '2',
}));
