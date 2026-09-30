import type { EmbeddingResult } from '@lib/embedding';
import type { TokenEncoding } from '@lib/embedding';
import type {
  ChatCompletionOptions,
  ChatCompletionResult,
} from '../../../worker-ai/src/services/llm.service';
import type { RulesetChunkMatch } from '../../../worker-ai/src/repositories/ruleset-chunk-search.repository';
import type { RerankResult } from '../../../worker-ai/src/services/reranker.service';

/**
 * Stand-ins for OpenAI and Cohere so `EVAL_PROVIDERS=fake pnpm eval:ai` can run the whole harness
 * without keys or cost. They check the plumbing only: their scores measure nothing.
 */
const DIMENSIONS = 1536;

/** A normalised bag-of-words vector: texts sharing words are close, like a (very) poor embedding. */
function bagOfWords(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash = Math.imul(hash ^ word.charCodeAt(i), 16777619);
    }
    vector[(hash >>> 0) % DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...vector);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}

export class FakeEmbeddingService {
  getModel(): string {
    return 'fake-bag-of-words';
  }

  generateEmbedding(text: string): Promise<EmbeddingResult> {
    return Promise.resolve({
      embedding: bagOfWords(text),
      index: 0,
      tokenCount: 0,
    });
  }

  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.resolve(
      texts.map((text, index) => ({
        embedding: bagOfWords(text),
        index,
        tokenCount: 0,
      })),
    );
  }
}

export class FakeRerankerService {
  getModel(): string {
    return 'fake-passthrough';
  }

  getTopN(): number {
    return 25;
  }

  rerank(_query: string, chunks: RulesetChunkMatch[]): Promise<RerankResult> {
    return Promise.resolve({ chunks: chunks.slice(0, 25), reranked: true });
  }
}

/** The clause IDs the response schema allows (C1, C2, …). */
function allowedClauseIds(options: ChatCompletionOptions): string[] {
  const path = ['properties', 'findings', 'items', 'properties', 'clauseId'];
  let node: unknown = options.responseSchema.schema;
  for (const segment of path) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[segment]
        : undefined;
  }
  const allowed =
    typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>).enum
      : undefined;
  return Array.isArray(allowed)
    ? allowed.filter((id): id is string => typeof id === 'string')
    : [];
}

/** Reports the first clause it was given, whatever the contract says. */
export class FakeLlmService {
  getModel(): string {
    return 'fake-first-clause';
  }

  getContextWindowTokens(): number {
    return 128_000;
  }

  getMaxOutputTokens(): number {
    return 4_096;
  }

  getTokenEncoding(): TokenEncoding {
    return 'o200k_base';
  }

  chatCompletion(
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    return Promise.resolve({
      usage: { promptTokens: 0, completionTokens: 0 },
      data: {
        summary: 'Fake model: reports the first supplied clause.',
        findings: allowedClauseIds(options)
          .slice(0, 1)
          .map((clauseId) => ({
            clauseId,
            riskReason: 'Fake.',
            riskLevel: 'high',
            title: 'Fake finding',
            description: 'Fake finding on the first supplied clause.',
            suggestion: 'None.',
            evidence: '',
          })),
      },
    });
  }
}
