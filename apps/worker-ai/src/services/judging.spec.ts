import { batches, cosine, relevantSections, runLimited } from './judging';

describe('clause-by-clause judging helpers', () => {
  it('splits clauses into batches', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([1, 2], 0)).toEqual([[1], [2]]);
  });

  it('runs at most `limit` calls at once and keeps the order', async () => {
    let running = 0;
    let peak = 0;
    const results = await runLimited([30, 10, 20, 5, 15], 2, async (ms) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((done) => setTimeout(done, ms));
      running--;
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40, 10, 30]);
    expect(peak).toBe(2);
  });

  it('measures cosine similarity, 0 for empty or mismatched vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([], [])).toBe(0);
    expect(cosine([1], [1, 0])).toBe(0);
  });

  it("pools each clause's nearest sections, most relevant first", () => {
    const sections = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.9, 0.1, 0],
    ];
    expect(
      relevantSections(
        [
          [0, 0, 1],
          [1, 0, 0],
        ],
        sections,
        2,
      ),
      // Section 2 is like neither clause, so it isn't taken
    ).toEqual([2, 0, 3]);
    expect(relevantSections([[0, 0, 1]], sections, 1)).toEqual([2]);
  });

  it('falls back to document order without usable embeddings', () => {
    expect(relevantSections([undefined], [[0], [0], [0]], 2)).toEqual([
      0, 1, 2,
    ]);
  });
});
