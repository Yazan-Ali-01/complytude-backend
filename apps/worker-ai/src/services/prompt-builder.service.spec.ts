import { TokenCounterService, type TokenEncoding } from '@lib/embedding';
import type { RulesetChunkMatch } from '../repositories/ruleset-chunk-search.repository';
import { LlmService } from './llm.service';
import {
  type DocumentView,
  PromptBuilderService,
} from './prompt-builder.service';

/** The Arabic contract passage measured in AI-008 (6,160 characters). */
const ARABIC =
  'يلتزم صاحب العمل بتقديم عقد عمل مكتوب باللغة العربية يتضمن اسم العامل وجنسيته وتاريخ ميلاده ورقم الهوية الإماراتية والأجر الأساسي والبدلات وفترة الإشعار. '.repeat(
    40,
  );

const CLAUSE: RulesetChunkMatch = {
  id: 'chunk-1',
  rulesetId: 'ruleset-1',
  rulesetVersionId: 'ruleset-1-v1',
  content: 'Every employment contract must be written in Arabic.',
  metadata: { authorityName: 'MOHRE', rulesetKey: 'uae_labour' },
  score: 1,
};

/** A document of one section. */
function whole(text: string): DocumentView {
  return { full: text, sections: [text], relevant: [0] };
}

const clauses = new Map([['C1', CLAUSE]]);

describe('PromptBuilderService', () => {
  const tokenCounter = new TokenCounterService();

  afterAll(() => tokenCounter.onModuleDestroy());

  function builder(model: {
    contextWindow: number;
    maxOutputTokens: number;
    encoding: TokenEncoding;
  }): PromptBuilderService {
    const llm = {
      getContextWindowTokens: () => model.contextWindow,
      getMaxOutputTokens: () => model.maxOutputTokens,
      getTokenEncoding: () => model.encoding,
    } as unknown as LlmService;
    return new PromptBuilderService(tokenCounter, llm);
  }

  it("shows a clause's guidance after its text, as an explanation the text overrides", () => {
    const model = {
      contextWindow: 50_000,
      maxOutputTokens: 1_000,
      encoding: 'o200k_base' as const,
    };
    const guided = new Map([
      [
        'C1',
        {
          ...CLAUSE,
          metadata: {
            ...CLAUSE.metadata,
            guidance: 'The contract has to be in Arabic, or bilingual.',
          },
        },
      ],
    ]);

    const withGuidance = builder(model).buildPrompt(
      'doc-1',
      whole('Contract.'),
      guided,
    );
    const without = builder(model).buildPrompt(
      'doc-1',
      whole('Contract.'),
      clauses,
    );

    expect(withGuidance.systemPrompt).toContain(
      'Every employment contract must be written in Arabic.\nGuidance: The contract has to be in Arabic, or bilingual.',
    );
    expect(withGuidance.systemPrompt).toContain(
      'judge the document against the text, and where the two differ, the text governs',
    );
    // Rulesets without guidance get the same prompt as before
    expect(without.systemPrompt).not.toContain('Guidance');
  });

  it('counts Arabic with the chat model tokenizer, not the embedding one', () => {
    expect(tokenCounter.countTokens(ARABIC, 'cl100k_base')).toBe(4_320);
    expect(tokenCounter.countTokens(ARABIC, 'o200k_base')).toBe(1_681);
  });

  it('keeps the whole Arabic document when it fits in the chat model budget', () => {
    // ~3.4k tokens for the document: enough under o200k_base, not under cl100k_base
    const model = { contextWindow: 5_000, maxOutputTokens: 1_000 };

    const o200k = builder({ ...model, encoding: 'o200k_base' }).buildPrompt(
      'doc-1',
      whole(ARABIC),
      clauses,
    );
    const cl100k = builder({ ...model, encoding: 'cl100k_base' }).buildPrompt(
      'doc-1',
      whole(ARABIC),
      clauses,
    );

    expect(o200k.wasDocumentTruncated).toBe(false);
    expect(o200k.userMessage).toContain(ARABIC.trim());
    expect(cl100k.wasDocumentTruncated).toBe(true);
  });

  it('reserves the configured output tokens, not a fixed 4,096', () => {
    const prompt = builder({
      contextWindow: 5_000,
      maxOutputTokens: 3_000,
      encoding: 'o200k_base',
    }).buildPrompt('doc-1', whole(ARABIC), clauses);

    expect(prompt.wasDocumentTruncated).toBe(true);
  });

  it('shows the most relevant sections in document order when the whole document is too long, without cutting any', () => {
    const sections = Array.from(
      { length: 5 },
      (_, i) => `Section ${i + 1}: ${'the employee works hours '.repeat(60)}`,
    );
    const prompt = builder({
      // Room for two ~253-token parts, not the whole ~1,265-token document
      contextWindow: 5_350,
      maxOutputTokens: 4_096,
      encoding: 'o200k_base',
    }).buildPrompt(
      'doc-1',
      { full: sections.join('\n\n'), sections, relevant: [3, 0, 4, 1, 2] },
      clauses,
    );

    expect(prompt.excerpted).toBe(true);
    expect(prompt.wasDocumentTruncated).toBe(false);
    // Parts 4 then 1 fit; shown in document order, and the model is told
    expect(prompt.userMessage).toContain('(parts 1, 4 of 5)');
    expect(prompt.userMessage.indexOf('[Part 1 of 5]')).toBeLessThan(
      prompt.userMessage.indexOf('[Part 4 of 5]'),
    );
    expect(prompt.userMessage).not.toContain('Section 2:');
    expect(prompt.systemPrompt).toContain('You see only parts of the document');
  });
});
