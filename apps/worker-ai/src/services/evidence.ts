/**
 * Checks that a finding's quote is really in the contract. The comparison ignores what a model
 * changes when it copies text (spacing, case, typographic quotes and dashes, Arabic diacritics
 * and tatweel), and maps the match back to the original text's offsets for the UI.
 */

/** Shorter quotes ("the", "AED") match almost any contract; longer ones are pasted, not quoted. */
export const MIN_QUOTE_CHARS = 8;
export const MAX_QUOTE_CHARS = 600;

/**
 * What a model puts around a quote it shortens: its own closing full stop or comma, an ellipsis
 * marking the cut, quotation marks (on normalised text: `…` is `...`, quotes and dashes are plain).
 */
const LEADING_EDGE = /^[\s"'.-]+/;
const TRAILING_QUOTES = /[\s"']+$/;
const TRAILING_EDGE = /[\s"'.,;:!?\u060C\u061B\u061F-]+$/;

/** Arabic harakat, superscript alef, tatweel, and zero-width characters. */
const IGNORED = /[\u064B-\u065F\u0670\u0640\u200B-\u200D\uFEFF]/;
/** Marks that belong to the letter before them: a match takes those after its last letter too. */
const COMBINING = /[\u064B-\u065F\u0670]/;
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
    if (needle.length > MAX_QUOTE_CHARS) return null;
    // As given, then without what the model added at the edges (quotation marks and an ellipsis,
    // then its own closing punctuation): the words stay verbatim, the longest match wins
    const unquoted = needle
      .replace(LEADING_EDGE, '')
      .replace(TRAILING_QUOTES, '');
    const trimmed = unquoted.replace(TRAILING_EDGE, '');
    for (const candidate of [needle, unquoted, trimmed]) {
      if (candidate.length < MIN_QUOTE_CHARS) continue;
      const at = haystack.text.indexOf(candidate);
      if (at < 0) continue;
      const start = haystack.map[at];
      const last = haystack.map[at + candidate.length - 1];
      const lastCodePoint = original.codePointAt(last) ?? 0;
      let end = last + (lastCodePoint > 0xffff ? 2 : 1);
      while (end < original.length && COMBINING.test(original[end])) end++;
      return { start, end };
    }
    return null;
  };
}
