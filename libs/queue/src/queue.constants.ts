export const QUEUE_NAMES = {
  AI_PROCESSING: 'ai-processing',
  DATA_INGESTION: 'data-ingestion',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
