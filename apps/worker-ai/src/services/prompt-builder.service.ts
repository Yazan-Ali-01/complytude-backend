import { TokenCounterService } from '@lib/embedding';
import { Injectable, Logger } from '@nestjs/common';
import { RulesetChunkMatch } from '../repositories/ruleset-chunk-search.repository';
import { LlmService } from './llm.service';

export interface BuiltPrompt {
  systemPrompt: string;
  userMessage: string;
  wasDocumentTruncated: boolean;
}

const OUTPUT_RESERVE_TOKENS = 4_096;
const SYSTEM_PROMPT_ESTIMATE_TOKENS = 600;

const SYSTEM_PROMPT = `You are a compliance analysis assistant. Your task is to analyze a legal or business document against a set of regulatory clauses and identify compliance issues, risks, and missing requirements.

You MUST respond with a valid JSON object matching this exact schema:
{
  "findings": [
    {
      "clauseRef": "<authority name and clause identifier, e.g. 'DMCC Employment Rule 4.2'>",
      "riskLevel": "<'high' | 'medium' | 'low'>",
      "title": "<short title of the issue, max 10 words>",
      "description": "<detailed description of the compliance gap or risk>",
      "suggestion": "<concrete recommendation to address the issue>"
    }
  ],
  "summary": "<overall summary of the compliance assessment, 2-4 sentences>"
}

Risk level definitions:
- high: Missing required clause, direct regulatory violation, or significant legal exposure
- medium: Ambiguous wording, incomplete clause, or potential conflict with regulation
- low: Best-practice gap, minor omission, or improvement opportunity

Rules:
- Only report findings that are directly supported by the provided regulatory context
- Do not invent regulatory requirements that are not in the provided clauses
- If the document is fully compliant with all provided clauses, return an empty findings array with an appropriate summary
- Be specific: cite the exact clause reference in clauseRef`;

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  constructor(
    private readonly tokenCounter: TokenCounterService,
    private readonly llmService: LlmService,
  ) {}

  buildPrompt(
    documentTitle: string,
    documentContent: string,
    chunks: RulesetChunkMatch[],
  ): BuiltPrompt {
    const availableContentTokens =
      this.llmService.getContextWindowTokens() -
      OUTPUT_RESERVE_TOKENS -
      SYSTEM_PROMPT_ESTIMATE_TOKENS;

    const rulesetContext = this.formatRulesetContext(chunks);
    const rulesetTokens = this.tokenCounter.countTokens(rulesetContext);

    const tokensForDocument = availableContentTokens - rulesetTokens;

    if (tokensForDocument <= 0) {
      this.logger.warn(
        `Ruleset context (${rulesetTokens} tokens) exhausted the entire content budget for ` +
          `"${documentTitle}" (available: ${availableContentTokens} tokens). ` +
          `Document will be reduced to a minimal stub. Consider reducing MAX_UNIQUE_CHUNKS.`,
      );
    }

    let finalDocumentContent = documentContent;
    let wasDocumentTruncated = false;

    const documentTokens = this.tokenCounter.countTokens(documentContent);

    if (documentTokens > tokensForDocument) {
      this.logger.warn(
        `Document "${documentTitle}" exceeds token budget: ${documentTokens} tokens, budget is ${tokensForDocument}. ` +
          `Truncating. Full sectioning support is planned in a future ticket.`,
      );
      finalDocumentContent =
        this.tokenCounter.truncateToTokens(
          documentContent,
          Math.max(tokensForDocument - 50, 100),
        ) +
        '\n\n[Document truncated due to length. Remaining content not analyzed.]';
      wasDocumentTruncated = true;
    }

    const userMessage = this.formatUserMessage(
      documentTitle,
      finalDocumentContent,
      rulesetContext,
    );

    return {
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      wasDocumentTruncated,
    };
  }

  private formatRulesetContext(chunks: RulesetChunkMatch[]): string {
    if (chunks.length === 0) {
      return '*(No regulatory context available)*';
    }

    const sections = chunks.map((chunk) => {
      const meta = chunk.metadata;
      const authorityName =
        typeof meta.authorityName === 'string'
          ? meta.authorityName
          : 'Unknown Authority';
      const clauseTitle =
        typeof meta.clauseTitle === 'string' ? meta.clauseTitle : '';
      const clauseId = typeof meta.clauseId === 'string' ? meta.clauseId : '';
      const rulesetKey =
        typeof meta.rulesetKey === 'string' ? meta.rulesetKey : '';

      const heading = [
        authorityName,
        clauseTitle ? `— ${clauseTitle}` : '',
        clauseId ? `(${clauseId})` : rulesetKey ? `[${rulesetKey}]` : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `### ${heading}\n${chunk.content}`;
    });

    return sections.join('\n\n');
  }

  private formatUserMessage(
    documentTitle: string,
    documentContent: string,
    rulesetContext: string,
  ): string {
    return `## Regulatory Context\n\n${rulesetContext}\n\n---\n\n## Document Under Review: ${documentTitle}\n\n${documentContent}\n\n---\n\nAnalyze the document against the regulatory clauses above. Identify all compliance issues, risks, and missing clauses. Return your analysis as a JSON object matching the schema provided in the system prompt.`;
  }
}
