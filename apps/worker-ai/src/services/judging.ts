/**
 * Clause-by-clause judging helpers: clauses are judged in small batches, a few at a time, and a
 * batch that can't see the whole document sees the sections most similar to its clauses.
 */

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function batches<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step)
    out.push(items.slice(i, i + step));
  return out;
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping the results in order. */
export async function runLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  return results;
}

/**
 * The document sections most relevant to a batch of clauses, most relevant first: each clause's
 * `perClause` nearest sections, pooled. Without usable embeddings, the sections in document order.
 */
export function relevantSections(
  clauseEmbeddings: Array<number[] | undefined>,
  sectionEmbeddings: number[][],
  perClause: number,
): number[] {
  const best = new Map<number, number>();
  for (const clause of clauseEmbeddings) {
    if (!clause) continue;
    const ranked = sectionEmbeddings
      .map((section, index) => ({ index, score: cosine(clause, section) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, perClause));
    for (const { index, score } of ranked) {
      best.set(index, Math.max(best.get(index) ?? 0, score));
    }
  }
  if (best.size === 0) return sectionEmbeddings.map((_, index) => index);
  return [...best].sort((a, b) => b[1] - a[1]).map(([index]) => index);
}
