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
  llmModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
  llmMaxTokens: parseInt(process.env.OPENAI_CHAT_MAX_TOKENS || '4096', 10),
  llmTemperature: parseFloat(process.env.OPENAI_CHAT_TEMPERATURE || '0.1'),
  llmTimeout: parseInt(process.env.OPENAI_CHAT_TIMEOUT || '120000', 10),

  // Cohere re-ranking configuration
  cohereApiKey: process.env.COHERE_API_KEY!,
  cohereRerankModel: process.env.COHERE_RERANK_MODEL || 'rerank-v3.5',
  rerankTopN: parseInt(process.env.RERANK_TOP_N || '25', 10),

  // RAG retrieval tuning
  ragTopKPerQuery: parseInt(process.env.RAG_TOP_K_PER_QUERY || '5', 10),
  ragVectorLimit: parseInt(process.env.RAG_VECTOR_LIMIT || '30', 10),
  ragBm25Limit: parseInt(process.env.RAG_BM25_LIMIT || '30', 10),
  ragMaxHybridResults: parseInt(process.env.RAG_MAX_HYBRID_RESULTS || '40', 10),

  // Resource limits
  memoryLimit: process.env.WORKER_AI_MEMORY_LIMIT || '2GB',
  cpuLimit: process.env.WORKER_AI_CPU_LIMIT || '2',
}));
