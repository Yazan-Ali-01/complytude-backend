import {
  detectAll,
  LEGAL_SUFFIX_AT_END,
  type Span,
  type SpanType,
} from './detectors';

/**
 * Replaces personal data with placeholders before any text leaves for an AI provider, and puts
 * the originals back into what comes back. The same value always gets the same placeholder, and
 * parties keep their contractual role (`[EMPLOYER]`, `[FIRST_SHAREHOLDER]`), so the model can
 * still reason about who owes what to whom.
 */
export interface Redaction {
  text: string;
  /** Placeholder → the original it replaced. Kept in memory for the job only. */
  entities: Map<string, string>;
  rehydrate(text: string): string;
  /** A span of the redacted text as a span of the original (a partly covered placeholder counts whole). */
  toOriginal(start: number, end: number): { start: number; end: number };
}

interface Segment {
  redacted: number;
  original: number;
  /** Lengths differ only for placeholders. */
  redactedLength: number;
  originalLength: number;
}

function originalIndex(
  segments: Segment[],
  index: number,
  side: 'start' | 'end',
): number {
  for (const s of segments) {
    if (index > s.redacted + s.redactedLength) continue;
    if (s.redactedLength === s.originalLength) {
      return s.original + (index - s.redacted);
    }
    // Inside or at the edge of a placeholder: the whole original value
    if (index === s.redacted + s.redactedLength) {
      return s.original + s.originalLength;
    }
    return side === 'start' ? s.original : s.original + s.originalLength;
  }
  const last = segments.at(-1);
  return last ? last.original + last.originalLength : index;
}

const HONORIFIC_BEFORE = String.raw`(?:Mr|Mrs|Ms|Miss|Dr|Sheikh|Sheikha)\.?\s+`;
const PLACEHOLDER = /\[[A-Z][A-Z0-9_]*\]/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A pattern for every occurrence of `phrase`, whatever the spacing and case. */
function phrasePattern(phrase: string, prefix = ''): RegExp {
  const words = phrase
    .split(/\s+/)
    .map(escapeRegExp)
    .join(String.raw`\s+`);
  return new RegExp(
    String.raw`(?<![\p{L}\p{N}])${prefix}(${words})(?![\p{L}\p{N}])`,
    'dgiu',
  );
}

function roleKey(role: string): string | null {
  const key = role
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return /^[A-Z]/.test(key) ? key : null;
}

function valueKey(type: SpanType, value: string): string {
  const compact = value.toLowerCase().replace(/[\s\-.()]/g, '');
  return `${type}:${compact}`;
}

interface NameTerm {
  core: string;
  placeholder: string;
}

export function identityRedaction(text: string): Redaction {
  return {
    text,
    entities: new Map(),
    rehydrate: (value) => value,
    toOriginal: (start, end) => ({ start, end }),
  };
}

export function redact(original: string, extra: Span[] = []): Redaction {
  const detected = [...detectAll(original), ...extra];
  const entities = new Map<string, string>();
  const placeholderOf = new Map<string, string>();
  const counters = new Map<string, number>();

  function numbered(prefix: string): string {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `[${prefix}_${next}]`;
  }

  // Names first: each party or person is replaced wherever it appears, not only where found
  const names: NameTerm[] = [];
  const nameSpans = detected
    .filter((s) => s.type === 'PARTY' || s.type === 'PERSON')
    .sort((a, b) => a.start - b.start);
  for (const span of nameSpans) {
    const full = original.slice(span.start, span.end).trim();
    const core = full.replace(LEGAL_SUFFIX_AT_END, '').trim();
    if (core.length < 3) continue;
    const key = `NAME:${core.toLowerCase().replace(/\s+/g, ' ')}`;
    if (placeholderOf.has(key)) continue;
    let placeholder: string;
    const role = span.type === 'PARTY' && span.role ? roleKey(span.role) : null;
    if (role && !entities.has(`[${role}]`)) placeholder = `[${role}]`;
    else if (role) placeholder = numbered(role);
    else placeholder = numbered(span.type === 'PARTY' ? 'PARTY' : 'PERSON');
    placeholderOf.set(key, placeholder);
    entities.set(placeholder, core);
    names.push({ core, placeholder });
  }

  interface Replacement {
    start: number;
    end: number;
    placeholder: string;
  }
  const replacements: Replacement[] = [];

  // Longest names first, so "Omar Al Rashid" wins over a surname-only match inside it
  for (const { core, placeholder } of [...names].sort(
    (a, b) => b.core.length - a.core.length,
  )) {
    for (const m of original.matchAll(phrasePattern(core))) {
      const [start, end] = m.indices![1];
      replacements.push({ start, end, placeholder });
    }
    // "Mr. Al Rashid": a person's surname after an honorific
    const words = core.split(/\s+/);
    if (words.length >= 2 && !LEGAL_SUFFIX_AT_END.test(`x ${words.at(-1)}`)) {
      const surname = /^(?:al|el|bin|bint|abu)$/i.test(words.at(-2) ?? '')
        ? words.slice(-2).join(' ')
        : (words.at(-1) ?? '');
      if (surname.length >= 3) {
        // Its own placeholder, so it re-hydrates to the surname the contract used
        const surnamePlaceholder = `${placeholder.slice(0, -1)}_SURNAME]`;
        for (const m of original.matchAll(
          phrasePattern(surname, HONORIFIC_BEFORE),
        )) {
          const [start, end] = m.indices![1];
          entities.set(surnamePlaceholder, original.slice(start, end));
          replacements.push({ start, end, placeholder: surnamePlaceholder });
        }
      }
    }
  }

  // Everything else: one placeholder per distinct value, numbered in order of appearance
  for (const span of detected
    .filter((s) => s.type !== 'PARTY' && s.type !== 'PERSON')
    .sort((a, b) => a.start - b.start)) {
    const value = original.slice(span.start, span.end);
    const key = valueKey(span.type, value);
    let placeholder = placeholderOf.get(key);
    if (!placeholder) {
      placeholder = numbered(span.type);
      placeholderOf.set(key, placeholder);
      entities.set(placeholder, value);
    }
    replacements.push({ start: span.start, end: span.end, placeholder });
  }

  // Overlaps: the earliest start wins, then the longest
  replacements.sort((a, b) => a.start - b.start || b.end - a.end);
  let text = '';
  let cursor = 0;
  const segments: Segment[] = [];
  const keep = (from: number, to: number): void => {
    if (to <= from) return;
    segments.push({
      redacted: text.length,
      original: from,
      redactedLength: to - from,
      originalLength: to - from,
    });
    text += original.slice(from, to);
  };
  for (const r of replacements) {
    if (r.start < cursor) continue;
    keep(cursor, r.start);
    segments.push({
      redacted: text.length,
      original: r.start,
      redactedLength: r.placeholder.length,
      originalLength: r.end - r.start,
    });
    text += r.placeholder;
    cursor = r.end;
  }
  keep(cursor, original.length);

  return {
    text,
    entities,
    rehydrate: (value) =>
      value.replace(PLACEHOLDER, (token) => entities.get(token) ?? token),
    toOriginal: (start, end) => ({
      start: originalIndex(segments, start, 'start'),
      end: originalIndex(segments, end, 'end'),
    }),
  };
}
