/**
 * Deterministic personal-data detectors for contract text. Each returns the spans to mask; the
 * redactor decides placeholders. Deliberately not detected, because the rules test them: amounts,
 * dates, durations, percentages, working hours, governing law and authority names.
 */
export type SpanType =
  | 'EMIRATES_ID'
  | 'IBAN'
  | 'PASSPORT'
  | 'PHONE'
  | 'EMAIL'
  | 'PO_BOX'
  | 'ADDRESS'
  | 'PERSON'
  | 'PARTY';

export interface Span {
  start: number;
  end: number;
  type: SpanType;
  /** PARTY only: the role the contract defines for it, e.g. "Employer". */
  role?: string;
}

function matches(text: string, pattern: RegExp, type: SpanType): Span[] {
  return [...text.matchAll(pattern)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    type,
  }));
}

/** Spans of capture group 1 (needs the `d` flag). */
function groupMatches(text: string, pattern: RegExp, type: SpanType): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(pattern)) {
    const [start, end] = m.indices?.[1] ?? [];
    if (start !== undefined && end !== undefined)
      spans.push({ start, end, type });
  }
  return spans;
}

/** Luhn check over a digit string that includes its check digit. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** ISO 13616: the rearranged IBAN, letters as numbers, is 1 modulo 97. */
export function ibanValid(iban: string): boolean {
  const compact = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = /\d/.test(char)
      ? char
      : String(char.charCodeAt(0) - 'A'.charCodeAt(0) + 10);
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

/** 784-YYYY-NNNNNNN-C with a valid check digit, or that hyphenated shape partly masked (X). */
export function emiratesIds(text: string): Span[] {
  const digits = matches(
    text,
    /(?<!\d)784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d(?!\d)/g,
    'EMIRATES_ID',
  ).filter((span) =>
    luhnValid(text.slice(span.start, span.end).replace(/\D/g, '')),
  );
  const masked = matches(
    text,
    /(?<![\w-])784-[\dX]{4}-[\dX]{7}-[\dX](?![\w-])/gi,
    'EMIRATES_ID',
  ).filter((span) => /x/i.test(text.slice(span.start, span.end)));
  return [...digits, ...masked];
}

export function ibans(text: string): Span[] {
  return matches(
    text,
    /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g,
    'IBAN',
  ).filter((span) => ibanValid(text.slice(span.start, span.end)));
}

export function emails(text: string): Span[] {
  return matches(
    text,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    'EMAIL',
  );
}

/** +971 / 00971 numbers, and local 0… landline and mobile numbers. */
export function phones(text: string): Span[] {
  return [
    ...matches(
      text,
      /(?<![\w+])(?:\+|00)971[\s-]?\(?0?\d{1,2}\)?(?:[\s-]?\d){6,8}(?!\d)/g,
      'PHONE',
    ),
    ...matches(
      text,
      /(?<![\w.,/-])0(?:5\d|[2-9])(?:[\s-]?\d){7}(?!\d)/g,
      'PHONE',
    ),
  ];
}

/** The number after "passport" (English) or "جواز" (Arabic); it must hold a digit or masking Xs. */
export function passports(text: string): Span[] {
  return [
    ...groupMatches(
      text,
      /\bpassport(?:\s*(?:no\.?|number|#))?\s*[:.]?\s*([A-Z]{0,3}-?[A-Z0-9]{5,12})\b/dgi,
      'PASSPORT',
    ),
    ...groupMatches(
      text,
      /جواز(?:\s+السفر)?(?:\s+رقم)?\s*:?\s*([A-Z0-9]{5,12})/dgu,
      'PASSPORT',
    ),
  ].filter((span) => /\d|X{4}/i.test(text.slice(span.start, span.end)));
}

export function poBoxes(text: string): Span[] {
  return [
    ...matches(
      text,
      /\b(?:P\.?\s?O\.?\s*Box|Post\s+Office\s+Box)\s*(?:No\.?\s*)?\d{1,7}\b/gi,
      'PO_BOX',
    ),
    ...matches(text, /ص\.?\s?ب\.?\s*:?\s*\d{1,7}/gu, 'PO_BOX'),
  ];
}

/** Villa, flat, apartment, building or street numbers with up to three address parts after them. */
export function addresses(text: string): Span[] {
  return matches(
    text,
    /\b(?:Villa|Flat|Apartment|Apt\.?|House|Building|Street|St\.)\s*(?:No\.?\s*)?[A-Z]?\d+[A-Z]?\b(?:,\s*[^,\n()"“”]{2,40}){0,3}/g,
    'ADDRESS',
  );
}

const HONORIFIC = String.raw`(?:Mr|Mrs|Ms|Miss|Dr|Sheikh|Sheikha|Eng|Prof)\.?`;
const NAME_WORD = String.raw`(?:[A-Z][a-zA-Z'-]+)`;
const PARTICLE = String.raw`(?:al|Al|bin|Bin|bint|Bint|Abu|el|El)`;
const ARABIC_WORD = String.raw`\p{Script=Arabic}+`;

/** Names after an honorific: "Mr. Omar Al Rashid", "Dr Smith", "السيد أحمد محمد". */
export function honorificNames(text: string): Span[] {
  return [
    ...groupMatches(
      text,
      new RegExp(
        String.raw`\b${HONORIFIC}\s+((?:${PARTICLE}[\s-])?${NAME_WORD}(?:[\s-](?:${PARTICLE}[\s-])?${NAME_WORD}){0,3})`,
        'dg',
      ),
      'PERSON',
    ),
    ...groupMatches(
      text,
      new RegExp(
        String.raw`(?:السيدة|السيد|الدكتورة|الدكتور|الشيخة|الشيخ|المهندسة|المهندس)\s+(${ARABIC_WORD}(?:\s+${ARABIC_WORD}){0,2})`,
        'dgu',
      ),
      'PERSON',
    ),
  ];
}

/** Names after a label: "Name: Sarah Johnson", "Employee Name: …", "الاسم: …". */
export function labelledNames(text: string): Span[] {
  return [
    ...groupMatches(
      text,
      new RegExp(
        String.raw`\b(?:Full\s+Name|Employee\s+Name|Name|Signatory)\s*:[ \t]*(${NAME_WORD}(?:[ \t]+(?:${PARTICLE}[ \t]+)?${NAME_WORD}){1,4})`,
        'dg',
      ),
      'PERSON',
    ),
    ...groupMatches(
      text,
      new RegExp(
        String.raw`الاسم\s*:\s*(${ARABIC_WORD}(?:[ \t]+${ARABIC_WORD}){0,3})`,
        'dgu',
      ),
      'PERSON',
    ),
  ];
}

/** Parties are defined in the preamble; a defined term further on is a clause, not a party. */
const PREAMBLE_CHARS = 3000;

const LEGAL_SUFFIX = String.raw`(?:L\.?L\.?C\.?|FZ-?LLC|FZE|FZCO|FZC|DMCC|Ltd\.?|Limited|PJSC|P\.J\.S\.C\.?|PSC|Inc\.?|Corp\.?|Corporation|LLP|PLC|GmbH|S\.A\.|B\.V\.)`;
export const LEGAL_SUFFIX_AT_END = new RegExp(String.raw`\s+${LEGAL_SUFFIX}$`);

const NOT_A_NAME =
  /^(?:this|the|these|that|each|all|any|such|which|whereas)\b/i;

/** A company, a person's name in capitalised words, or an Arabic name. */
function looksLikePartyName(name: string): boolean {
  if (name.length < 3 || name.length > 80 || NOT_A_NAME.test(name)) {
    return false;
  }
  if (LEGAL_SUFFIX_AT_END.test(name)) return true;
  if (/^\p{Script=Arabic}/u.test(name)) return true;
  const words = name.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 6 &&
    words.every((w) => new RegExp(`^(?:${NAME_WORD}|${PARTICLE})$`).test(w))
  );
}

/**
 * Parties the preamble defines: `Gulf Trading LLC, a company … ("Employer")`,
 * `**Mr. Omar Al Rashid** (the "Second Shareholder")`. The span covers the name, without an
 * honorific; the role becomes its placeholder.
 */
export function parties(text: string): Span[] {
  const spans: Span[] = [];
  const marker = /\((?:the\s+)?["“]([^"”\n]{2,40})["”]\)/g;
  for (const m of text.slice(0, PREAMBLE_CHARS).matchAll(marker)) {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const before = text.slice(lineStart, m.index);
    const lead =
      /^[ \t]*(?:\d+[.)][ \t]*|[-*•][ \t]*)?(?:(?:BETWEEN|AND|Between|And)[ \t]*:?[ \t]*)?(?:\*\*)?(?:(?:Mr|Mrs|Ms|Miss|Dr|Sheikh|Sheikha)\.?\s+)?/.exec(
        before,
      );
    const offset = lead ? lead[0].length : 0;
    const rest = before.slice(offset);
    const comma = rest.indexOf(',');
    const raw = comma >= 0 ? rest.slice(0, comma) : rest;
    const name = raw.replace(/\*\*/g, '').trim();
    if (!looksLikePartyName(name)) continue;
    const start = lineStart + offset + raw.indexOf(name.slice(0, 1));
    spans.push({
      start,
      end: start + name.length,
      type: 'PARTY',
      role: m[1].trim(),
    });
  }
  return spans;
}

export function detectAll(text: string): Span[] {
  return [
    ...emiratesIds(text),
    ...ibans(text),
    ...emails(text),
    ...phones(text),
    ...passports(text),
    ...poBoxes(text),
    ...addresses(text),
    ...parties(text),
    ...honorificNames(text),
    ...labelledNames(text),
  ];
}
