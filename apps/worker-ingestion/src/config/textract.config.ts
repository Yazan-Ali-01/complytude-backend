import { registerAs } from '@nestjs/config';

export const textractConfig = registerAs('textract', () => ({
  maxPages: parseInt(process.env.TEXTRACT_MAX_PAGES ?? '50', 10),
  pollInitialDelayMs: parseInt(
    process.env.TEXTRACT_POLL_INITIAL_DELAY_MS ?? '2000',
    10,
  ),
  pollMaxDelayMs: parseInt(
    process.env.TEXTRACT_POLL_MAX_DELAY_MS ?? '30000',
    10,
  ),
  pollMaxAttempts: parseInt(process.env.TEXTRACT_POLL_MAX_ATTEMPTS ?? '60', 10),
  pollBackoffMultiplier: parseFloat(
    process.env.TEXTRACT_POLL_BACKOFF_MULTIPLIER ?? '1.5',
  ),
}));

export type TextractConfig = ReturnType<typeof textractConfig>;
