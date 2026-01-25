import { Injectable, Logger } from '@nestjs/common';

export interface PiiMatch {
  type: PiiType;
  value: string;
  startIndex: number;
  endIndex: number;
  replacement: string;
}

export enum PiiType {
  SSN = 'SSN',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  ADDRESS = 'ADDRESS',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
  CREDIT_CARD = 'CREDIT_CARD',
  EMPLOYEE_NAME = 'EMPLOYEE_NAME',
  DATE_OF_BIRTH = 'DATE_OF_BIRTH',
}

export interface MaskResult {
  maskedContent: string;
  matches: PiiMatch[];
}

@Injectable()
export class PiiMaskingService {
  private readonly logger = new Logger(PiiMaskingService.name);

  private readonly patterns: RegExp[] = [
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    /\b(?:Account\s*(?:#|No\.?|Number)?\s*:?\s*)\d{4,17}\b/gi,
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ];

  private readonly patternMap: Record<PiiType, RegExp> = {
    [PiiType.SSN]: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    [PiiType.EMAIL]: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    [PiiType.PHONE]: /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    [PiiType.CREDIT_CARD]: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    [PiiType.BANK_ACCOUNT]: /\b(?:Account\s*(?:#|No\.?|Number)?\s*:?\s*)\d{4,17}\b/gi,
    [PiiType.ADDRESS]: /\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)\.?(?:\s+(?:Apt|Suite|Unit|#)\s*[A-Za-z0-9-]+)?/gi,
    [PiiType.EMPLOYEE_NAME]: /\b(?:Employee|Name)\s*(?::|Name)?\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/gi,
    [PiiType.DATE_OF_BIRTH]: /\b(?:DOB|Date of Birth|Birth Date|Birthday)\s*:?\s*(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/gi,
  };

  private readonly tokenMap: Record<PiiType, string> = {
    [PiiType.SSN]: '[SSN]',
    [PiiType.EMAIL]: '[EMAIL]',
    [PiiType.PHONE]: '[PHONE]',
    [PiiType.ADDRESS]: '[ADDRESS]',
    [PiiType.BANK_ACCOUNT]: '[BANK_ACCOUNT]',
    [PiiType.CREDIT_CARD]: '[CREDIT_CARD]',
    [PiiType.EMPLOYEE_NAME]: '[EMPLOYEE_NAME]',
    [PiiType.DATE_OF_BIRTH]: '[DATE_OF_BIRTH]',
  };

  mask(content: string): string {
    this.logger.debug(`Masking PII in content of length: ${content.length}`);
    let maskedContent = content;

    const matches = this.detectPii(content);
    matches.sort((a, b) => b.startIndex - a.startIndex);

    for (const match of matches) {
      maskedContent =
        maskedContent.substring(0, match.startIndex) +
        match.replacement +
        maskedContent.substring(match.endIndex);
    }

    return maskedContent;
  }

  maskWithDetails(content: string): MaskResult {
    const matches = this.detectPii(content);
    return {
      maskedContent: this.mask(content),
      matches,
    };
  }

  detectPii(content: string): PiiMatch[] {
    this.logger.debug(`Detecting PII in content of length: ${content.length}`);
    const matches: PiiMatch[] = [];

    for (const [type, pattern] of Object.entries(this.patternMap)) {
      const piiType = type as PiiType;
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        matches.push({
          type: piiType,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          replacement: this.tokenMap[piiType],
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    this.logger.debug(`Found ${matches.length} PII matches`);
    return matches;
  }

  getMaskedCount(content: string): number {
    return this.detectPii(content).length;
  }

  hasPii(content: string): boolean {
    return this.detectPii(content).length > 0;
  }

  unmask(content: string, _originalContent: string): string {
    this.logger.warn('Unmasking is not supported - use original content');
    return content;
  }

  isValidSsn(value: string): boolean {
    const ssnPattern = /^\d{3}[-.\s]?\d{2}[-.\s]?\d{4}$/;
    return ssnPattern.test(value);
  }

  isValidEmail(value: string): boolean {
    const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
    return emailPattern.test(value);
  }

  isValidPhone(value: string): boolean {
    const phonePattern = /^(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
    return phonePattern.test(value);
  }

  isValidCreditCard(value: string): boolean {
    const cleanValue = value.replace(/[-.\s]/g, '');
    if (!/^\d{13,19}$/.test(cleanValue)) {
      return false;
    }
    let sum = 0;
    let isEven = false;
    for (let i = cleanValue.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanValue[i], 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }
}