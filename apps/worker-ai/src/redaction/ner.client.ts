import type { Span } from './detectors';

/**
 * Person names the deterministic detectors can't find (a name in the body with no honorific),
 * from a self-hosted named-entity service speaking the Presidio analyzer API
 * (`POST /analyze` → `[{ entity_type, start, end, score }]`). It runs inside our network: an
 * external API here would just be another processor receiving the contract.
 */
interface AnalyzerResult {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

function isAnalyzerResult(value: unknown): value is AnalyzerResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.entity_type === 'string' &&
    typeof record.start === 'number' &&
    typeof record.end === 'number' &&
    typeof record.score === 'number'
  );
}

export class NerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly languages: string[],
    private readonly timeoutMs: number,
    private readonly minScore = 0.6,
  ) {}

  /** Throws on any failure: the caller must not send the text on without it. */
  async persons(text: string): Promise<Span[]> {
    const spans: Span[] = [];
    for (const language of this.languages) {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/analyze`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            language,
            entities: ['PERSON'],
            score_threshold: this.minScore,
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Name recognition (${language}) answered ${response.status}`,
        );
      }
      const body = (await response.json()) as unknown;
      if (!Array.isArray(body) || !body.every(isAnalyzerResult)) {
        throw new Error(
          `Name recognition (${language}) returned an unexpected body`,
        );
      }
      for (const result of body) {
        if (
          result.entity_type === 'PERSON' &&
          result.score >= this.minScore &&
          result.end > result.start
        ) {
          spans.push({ start: result.start, end: result.end, type: 'PERSON' });
        }
      }
    }
    return spans;
  }
}
