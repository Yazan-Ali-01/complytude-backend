import { Injectable, Logger } from '@nestjs/common';
import nlp from 'compromise';

export interface PiiMatch {
  type: PiiType;
  value: string;
  startIndex: number;
  endIndex: number;
  replacement: string;
  confidence: 'high' | 'medium' | 'low';
}

export enum PiiType {
  // NLP-detected entities
  PERSON_NAME = 'PERSON_NAME',
  ORGANIZATION = 'ORGANIZATION',
  PLACE = 'PLACE',

  // Pattern-detected entities
  SSN = 'SSN',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
  DATE_OF_BIRTH = 'DATE_OF_BIRTH',
  ADDRESS = 'ADDRESS',
}

export interface MaskResult {
  maskedContent: string;
  matches: PiiMatch[];
  stats: {
    totalMatches: number;
    byType: Record<string, number>;
    processingTimeMs: number;
  };
}

interface NlpEntity {
  text: string;
  offset: { start: number; length: number };
}

@Injectable()
export class PiiMaskingService {
  private readonly logger = new Logger(PiiMaskingService.name);

  // Regex patterns for structured PII (high confidence)
  private readonly patterns: Record<
    string,
    { regex: RegExp; type: PiiType; confidence: 'high' | 'medium' }
  > = {
    ssn: {
      regex: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
      type: PiiType.SSN,
      confidence: 'high',
    },
    email: {
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      type: PiiType.EMAIL,
      confidence: 'high',
    },
    phone: {
      regex: /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      type: PiiType.PHONE,
      confidence: 'high',
    },
    creditCard: {
      regex: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
      type: PiiType.CREDIT_CARD,
      confidence: 'high',
    },
    bankAccount: {
      regex: /\b(?:Account\s*(?:#|No\.?|Number)?\s*:?\s*)\d{4,17}\b/gi,
      type: PiiType.BANK_ACCOUNT,
      confidence: 'medium',
    },
    dateOfBirth: {
      regex:
        /\b(?:DOB|Date of Birth|Birth Date|Birthday)\s*:?\s*(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/gi,
      type: PiiType.DATE_OF_BIRTH,
      confidence: 'high',
    },
  };

  // Token replacements
  private readonly tokenMap: Record<PiiType, string> = {
    [PiiType.PERSON_NAME]: '[PERSON_NAME]',
    [PiiType.ORGANIZATION]: '[ORGANIZATION]',
    [PiiType.PLACE]: '[PLACE]',
    [PiiType.SSN]: '[SSN]',
    [PiiType.EMAIL]: '[EMAIL]',
    [PiiType.PHONE]: '[PHONE]',
    [PiiType.CREDIT_CARD]: '[CREDIT_CARD]',
    [PiiType.BANK_ACCOUNT]: '[BANK_ACCOUNT]',
    [PiiType.DATE_OF_BIRTH]: '[DATE_OF_BIRTH]',
    [PiiType.ADDRESS]: '[ADDRESS]',
  };

  /**
   * Mask PII in content and return the masked string
   */
  mask(content: string): string {
    const result = this.maskWithDetails(content);
    return result.maskedContent;
  }

  /**
   * Mask PII and return detailed information about matches
   */
  maskWithDetails(content: string): MaskResult {
    const startTime = Date.now();
    this.logger.debug(`Masking PII in content of length: ${content.length}`);

    const matches = this.detectPii(content);

    // Sort by position (descending) to replace from end to start
    matches.sort((a, b) => b.startIndex - a.startIndex);

    let maskedContent = content;
    for (const match of matches) {
      maskedContent =
        maskedContent.substring(0, match.startIndex) +
        match.replacement +
        maskedContent.substring(match.endIndex);
    }

    // Calculate stats
    const byType: Record<string, number> = {};
    for (const match of matches) {
      byType[match.type] = (byType[match.type] ?? 0) + 1;
    }

    const processingTimeMs = Date.now() - startTime;
    this.logger.debug(
      `PII masking completed: ${matches.length} matches in ${processingTimeMs}ms`,
    );

    return {
      maskedContent,
      matches,
      stats: {
        totalMatches: matches.length,
        byType,
        processingTimeMs,
      },
    };
  }

  /**
   * Detect all PII in content using NLP + regex patterns
   */
  detectPii(content: string): PiiMatch[] {
    const matches: PiiMatch[] = [];

    // 1. NLP-based detection using compromise
    matches.push(...this.detectNlpEntities(content));

    // 2. Pattern-based detection using regex
    matches.push(...this.detectPatternEntities(content));

    // 3. Deduplicate overlapping matches (prefer higher confidence)
    return this.deduplicateMatches(matches);
  }

  /**
   * Detect named entities using compromise NLP
   */
  private detectNlpEntities(content: string): PiiMatch[] {
    const matches: PiiMatch[] = [];
    const doc = nlp(content);

    // Detect person names
    const people = doc.people();
    this.extractNlpMatches(
      content,
      people.out('array') as string[],
      PiiType.PERSON_NAME,
      matches,
    );

    // Detect organizations
    const orgs = doc.organizations();
    this.extractNlpMatches(
      content,
      orgs.out('array') as string[],
      PiiType.ORGANIZATION,
      matches,
    );

    // Detect places
    const places = doc.places();
    this.extractNlpMatches(
      content,
      places.out('array') as string[],
      PiiType.PLACE,
      matches,
    );

    return matches;
  }

  /**
   * Extract matches from NLP results and find their positions
   */
  private extractNlpMatches(
    content: string,
    entities: string[],
    type: PiiType,
    matches: PiiMatch[],
  ): void {
    for (const entity of entities) {
      if (!entity || entity.length < 2) continue;

      // Find all occurrences of this entity
      let searchStart = 0;
      let index = content.indexOf(entity, searchStart);

      while (index !== -1) {
        matches.push({
          type,
          value: entity,
          startIndex: index,
          endIndex: index + entity.length,
          replacement: this.tokenMap[type],
          confidence: 'medium', // NLP detection is medium confidence
        });
        searchStart = index + entity.length;
        index = content.indexOf(entity, searchStart);
      }
    }
  }

  /**
   * Detect PII using regex patterns
   */
  private detectPatternEntities(content: string): PiiMatch[] {
    const matches: PiiMatch[] = [];

    for (const [_key, pattern] of Object.entries(this.patterns)) {
      // Reset regex lastIndex
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(content)) !== null) {
        matches.push({
          type: pattern.type,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          replacement: this.tokenMap[pattern.type],
          confidence: pattern.confidence,
        });
      }
    }

    return matches;
  }

  /**
   * Remove overlapping matches, preferring higher confidence
   */
  private deduplicateMatches(matches: PiiMatch[]): PiiMatch[] {
    if (matches.length === 0) return matches;

    // Sort by start position, then by confidence (high first)
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    matches.sort((a, b) => {
      if (a.startIndex !== b.startIndex) {
        return a.startIndex - b.startIndex;
      }
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    });

    const result: PiiMatch[] = [];
    let lastEnd = -1;

    for (const match of matches) {
      // Skip if this match overlaps with a previous one
      if (match.startIndex < lastEnd) {
        continue;
      }
      result.push(match);
      lastEnd = match.endIndex;
    }

    return result;
  }

  /**
   * Check if content contains any PII
   */
  hasPii(content: string): boolean {
    return this.detectPii(content).length > 0;
  }

  /**
   * Get summary of PII types found in content
   */
  analyzePii(content: string): {
    hasPii: boolean;
    types: PiiType[];
    count: number;
  } {
    const matches = this.detectPii(content);
    const types = [...new Set(matches.map((m) => m.type))];

    return {
      hasPii: matches.length > 0,
      types,
      count: matches.length,
    };
  }

  // Validation helpers for specific PII types
  isValidEmail(email: string): boolean {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(email);
  }

  isValidPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  isValidSSN(ssn: string): boolean {
    const cleaned = ssn.replace(/\D/g, '');
    return cleaned.length === 9;
  }

  isValidCreditCard(card: string): boolean {
    const cleaned = card.replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;

    // Luhn algorithm check
    let sum = 0;
    let isEven = false;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }
}
