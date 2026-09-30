/**
 * Checks that a finding's quote is really in the contract. The comparison ignores what a model
 * changes when it copies text (spacing, case, typographic quotes and dashes, Arabic diacritics
 * and tatweel), and maps the match back to the original text's offsets for the UI.
 */

/** Shorter quotes ("the", "AED") match almost any contract; longer ones are pasted, not quoted. */
export const MIN_QUOTE_CHARS = 8;
export const MAX_QUOTE_CHARS = 600;

/** Arabic harakat, superscript alef, tatweel, and zero-width characters. */
const IGNORED = /[\u064B-\u065F\u0670\u0640\u200B-\u200D\uFEFF]/;
const DASH = /[\u2010-\u2015\u2212]/;
const QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u00AB': '"',
  '\u00BB': '"',
};

export interface NormalizedText {
  text: string;
  /** For every UTF-16 unit of `text`, the index in the original text it came from. */
  map: number[];
}

export function normalizeWithMap(original: string): NormalizedText {
  let text = '';
  const map: number[] = [];
  let pendingSpace = -1;
  let index = 0;
  for (const char of original) {
    const at = index;
    index += char.length;
    if (/\s/.test(char)) {
      if (pendingSpace < 0) pendingSpace = at;
      continue;
    }
    if (IGNORED.test(char)) continue;
    if (pendingSpace >= 0) {
      if (text.length > 0) {
        text += ' ';
        map.push(pendingSpace);
      }
      pendingSpace = -1;
    }
    const normalized =
      QUOTES[char] ??
      (DASH.test(char) ? '-' : char.normalize('NFKC').toLowerCase());
    for (let unit = 0; unit < normalized.length; unit++) map.push(at);
    text += normalized;
  }
  return { text, map };
}

export interface QuoteSpan {
  /** Offsets in the original text: `text.slice(start, end)` is the quoted passage. */
  start: number;
  end: number;
}

/** Normalises the text once; the returned function finds each quote in it. */
export function createQuoteLocator(
  original: string,
): (quote: string) => QuoteSpan | null {
  const haystack = normalizeWithMap(original);
  return (quote) => {
    const needle = normalizeWithMap(quote).text;
    if (needle.length < MIN_QUOTE_CHARS || needle.length > MAX_QUOTE_CHARS) {
      return null;
    }
    const at = haystack.text.indexOf(needle);
    if (at < 0) return null;
    const start = haystack.map[at];
    const last = haystack.map[at + needle.length - 1];
    const lastCodePoint = original.codePointAt(last) ?? 0;
    return { start, end: last + (lastCodePoint > 0xffff ? 2 : 1) };
  };
}
