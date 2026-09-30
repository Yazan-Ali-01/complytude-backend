import { TokenCounterService, type TokenEncoding } from '@lib/embedding';
import type { RulesetChunkMatch } from '../repositories/ruleset-chunk-search.repository';
import { LlmService } from './llm.service';
import { PromptBuilderService } from './prompt-builder.service';

/** The Arabic contract passage measured in AI-008 (6,160 characters). */
const ARABIC =
  'يلتزم صاحب العمل بتقديم عقد عمل مكتوب باللغة العربية يتضمن اسم العامل وجنسيته وتاريخ ميلاده ورقم الهوية الإماراتية والأجر الأساسي والبدلات وفترة الإشعار. '.repeat(
    40,
  );

const CLAUSE: RulesetChunkMatch = {
  id: 'chunk-1',
  rulesetId: 'ruleset-1',
  content: 'Every employment contract must be written in Arabic.',
  metadata: { authorityName: 'MOHRE', rulesetKey: 'uae_labour' },
  score: 1,
};

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

  it('counts Arabic with the chat model tokenizer, not the embedding one', () => {
    expect(tokenCounter.countTokens(ARABIC, 'cl100k_base')).toBe(4_320);
    expect(tokenCounter.countTokens(ARABIC, 'o200k_base')).toBe(1_681);
  });

  it('keeps the whole Arabic document when it fits in the chat model budget', () => {
    // ~3.4k tokens for the document: enough under o200k_base, not under cl100k_base
    const model = { contextWindow: 5_000, maxOutputTokens: 1_000 };

    const o200k = builder({ ...model, encoding: 'o200k_base' }).buildPrompt(
      'عقد عمل',
      ARABIC,
      [CLAUSE],
    );
    const cl100k = builder({ ...model, encoding: 'cl100k_base' }).buildPrompt(
      'عقد عمل',
      ARABIC,
      [CLAUSE],
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
    }).buildPrompt('عقد عمل', ARABIC, [CLAUSE]);

    expect(prompt.wasDocumentTruncated).toBe(true);
  });
});
