import type { LayoutItem } from './document-layout';

/** A positioned run of text on a page: PDF units, origin at the bottom left, `y` the baseline. */
export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  rtl: boolean;
}

export interface TextLine {
  text: string;
  size: number;
  /** Baseline distance from the top of the page. */
  top: number;
  rtl: boolean;
}

export interface PageText {
  page: number;
  height: number;
  lines: TextLine[];
  /** Letters and digits in the page's text layer: how we tell a text page from a scanned one. */
  usableChars: number;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/** The PDF can't be opened: damaged, not a PDF, or password-protected. */
export class UnreadableTextLayerError extends Error {}

let pdfjs: PdfJs | undefined;

/**
 * pdf.js ships only as an ES module. Node (22.12+) loads one through `require`, so it is loaded
 * that way, resolved from this file (the bundle, in production): a dynamic `import()` would also
 * work in the build, but not in Jest's sandbox.
 */
export function loadPdfJs(): PdfJs {
  pdfjs ??= process.getBuiltinModule('node:module').createRequire(__filename)(
    'pdfjs-dist/legacy/build/pdf.mjs',
  ) as PdfJs;
  return pdfjs;
}

/**
 * Every page's text layer, read locally with pdf.js: nothing leaves the worker. The file is
 * untrusted, so pdf.js loads no fonts, XFA forms or WebAssembly decoders, and only text is read
 * (nothing is rendered). pdf.js 6 has no eval path at all.
 */
export async function readTextLayer(pdf: Uint8Array): Promise<PageText[]> {
  const { getDocument, VerbosityLevel } = loadPdfJs();
  const task = getDocument({
    // A copy: pdf.js may take ownership of the buffer it's given
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    useWasm: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    return await readPages(await task.promise);
  } catch (err) {
    // Parsing is deterministic: a file that fails once fails every time
    throw new UnreadableTextLayerError(
      `The PDF can't be read: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await task.destroy();
  }
}

async function readPages(
  document: Awaited<ReturnType<PdfJs['getDocument']>['promise']>,
): Promise<PageText[]> {
  const pages: PageText[] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const [, bottom, , top] = page.view;
    const content = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const text = clean(item.str);
      if (!text.trim()) continue;
      const [, , c, d, x, y] = item.transform as number[];
      runs.push({
        text,
        x,
        y: y - bottom,
        width: item.width,
        size: Math.hypot(c, d) || item.height,
        rtl: item.dir === 'rtl',
      });
    }
    pages.push({
      page: number,
      height: top - bottom,
      lines: linesOf(runs, top - bottom),
      usableChars: countUsable(runs.map((r) => r.text).join(' ')),
    });
    page.cleanup();
  }
  return pages;
}

/**
 * Drops what isn't text: private-use glyphs, U+FFFD, controls. A private-use glyph on its own is
 * a bullet from a symbol font, and stays one.
 */
function clean(text: string): string {
  if (/^\s*\p{Co}\s*$/u.test(text)) return '•';
  return text.replace(/[\p{Co}\p{Cc}\uFFFD]/gu, ' ').replace(/\s+/g, ' ');
}

export function countUsable(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

/**
 * Runs → lines in reading order. Runs on the same baseline form a line, read left to right, or
 * right to left when most of it is right-to-left text. A page split by a gutter down the middle
 * (a bilingual contract with English and Arabic side by side) is read one column at a time.
 */
export function linesOf(runs: TextRun[], pageHeight: number): TextLine[] {
  const columns = splitColumns(runs);
  return columns.flatMap((column) => lineUp(column, pageHeight));
}

function lineUp(runs: TextRun[], pageHeight: number): TextLine[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextRun[][] = [];
  for (const run of sorted) {
    const line = groups[groups.length - 1];
    if (
      line &&
      Math.abs(line[0].y - run.y) <= 0.4 * Math.max(line[0].size, run.size)
    ) {
      line.push(run);
    } else {
      groups.push([run]);
    }
  }

  return groups
    .map((group): TextLine => {
      const rtlChars = sum(
        group.filter((r) => r.rtl).map((r) => r.text.length),
      );
      const rtl = rtlChars * 2 > sum(group.map((r) => r.text.length));
      const ordered = [...group].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
      let text = '';
      for (let i = 0; i < ordered.length; i++) {
        const run = ordered[i];
        if (i > 0) {
          const prev = ordered[i - 1];
          const gap = rtl
            ? prev.x - (run.x + run.width)
            : run.x - (prev.x + prev.width);
          if (gap > 0.15 * Math.max(prev.size, run.size)) text += ' ';
        }
        text += run.text;
      }
      const longest = group.reduce((a, b) =>
        b.text.length > a.text.length ? b : a,
      );
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        size: longest.size,
        top: pageHeight - group[0].y,
        rtl,
      };
    })
    .filter((line) => line.text.length > 0);
}

/**
 * Two columns when a vertical gutter in the middle of the page separates the text: an x that
 * almost no run crosses, with plenty of text on each side. Otherwise one column.
 */
function splitColumns(runs: TextRun[]): TextRun[][] {
  if (runs.length < 10) return [runs];
  const left = Math.min(...runs.map((r) => r.x));
  const right = Math.max(...runs.map((r) => r.x + r.width));
  const width = right - left;
  const size = median(runs.map((r) => r.size));
  if (width < 20 * size) return [runs];

  let best: { x: number; crossing: number } | undefined;
  for (let x = left + width * 0.3; x <= left + width * 0.7; x += size / 2) {
    const crossing = runs.filter((r) => r.x < x && r.x + r.width > x).length;
    if (!best || crossing < best.crossing) best = { x, crossing };
  }
  if (!best || best.crossing > runs.length * 0.02) return [runs];

  const gutter = best.x;
  const first = runs.filter((r) => r.x + r.width <= gutter);
  const second = runs.filter((r) => r.x + r.width > gutter);
  const chars = (rs: TextRun[]): number => sum(rs.map((r) => r.text.length));
  const total = chars(runs);
  if (chars(first) < total * 0.2 || chars(second) < total * 0.2) return [runs];

  // Both columns must run down the page side by side, not be one indented block
  const rows = (rs: TextRun[]): Set<number> =>
    new Set(rs.map((r) => Math.round(r.y / size)));
  const firstRows = rows(first);
  const shared = [...rows(second)].filter((row) => firstRows.has(row)).length;
  if (shared < Math.min(firstRows.size, rows(second).size) * 0.5) return [runs];

  // The column holding most of the right-to-left text is read second, as a reader would
  const rtlShare = (rs: TextRun[]): number =>
    sum(rs.filter((r) => r.rtl).map((r) => r.text.length)) /
    Math.max(chars(rs), 1);
  return rtlShare(first) > rtlShare(second) ? [second, first] : [first, second];
}

const PAGE_NUMBER =
  /^(?:(?:page|p\.|صفحة|الصفحة)\s*)?[-–—]?\s*[\d٠-٩]{1,4}\s*[-–—]?(?:\s*(?:of|من|\/)\s*[\d٠-٩]{1,4})?$/i;
const HEADING_KEYWORD =
  /^(?:article|section|clause|schedule|annex|appendix|part|chapter|exhibit)\s+(?:[\dIVXLC]+|[A-Z]\b|one|two|three|four|five|six|seven|eight|nine|ten)/i;
const ARABIC_HEADING_KEYWORD = /^(?:المادة|البند|الفصل|الباب|الملحق|القسم)\s/;
const NUMBERED_TITLE =
  /^\d{1,2}(?:\.\d{1,2})*\.?\s+[\p{Lu}][\p{L}'’-]*(?:\s+(?:[\p{Lu}][\p{L}'’-]*|of|and|the|to|for|in|on|or|by|with|&|[—–-]))*$/u;
const LIST_MARKER = /^(?:\(?(?:\d{1,3}|[a-z]|[ivx]{1,5})[.)]|[•●▪■◦–-])\s/i;

function inCapitals(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && /^[\p{Lu}]+$/u.test(letters);
}

/**
 * A line that reads as a heading whatever its font size: "ARTICLE 5 — TERM", "1.4 Bearer
 * Shares", or a short line in capitals, unless the lines around it are capitals too (a paragraph
 * written in capitals, as limitation-of-liability clauses often are).
 */
function looksLikeHeading(text: string, neighbourInCapitals: boolean): boolean {
  if (text.length > 100 || /[.,;:]$/.test(text)) return false;
  if (HEADING_KEYWORD.test(text) || ARABIC_HEADING_KEYWORD.test(text)) {
    return true;
  }
  if (NUMBERED_TITLE.test(text)) return true;
  return (
    inCapitals(text) && !neighbourInCapitals && text.split(/\s+/).length <= 12
  );
}

/**
 * The pages' text layers → layout items, like OCR's layout: page numbers and running
 * headers or footers dropped, lines joined into paragraphs, and headings (larger than the body
 * text, or reading as one) starting sections. The largest heading on the first page is the title.
 */
export function layoutFromTextLayer(pages: PageText[]): LayoutItem[] {
  const kept = dropPageFurniture(pages);
  const bodySize = mostCommonSize(kept.flatMap((p) => p.lines));
  const tight = (a: TextLine, b: TextLine): boolean =>
    Math.abs(b.top - a.top) <= 1.5 * Math.max(a.size, b.size);

  const paragraphs: Array<{
    page: number;
    lines: TextLine[];
    readsAsHeading: boolean;
  }> = [];
  for (const { page, lines } of kept) {
    // Body-size lines that read as headings stand alone; larger text is split by size
    const standalone = lines.map((line, i) => {
      const neighbourInCapitals = [lines[i - 1], lines[i + 1]].some(
        (other) => other && tight(line, other) && inCapitals(other.text),
      );
      return (
        line.size < bodySize * 1.12 &&
        looksLikeHeading(line.text, neighbourInCapitals)
      );
    });
    let current: TextLine[] = [];
    let currentStandalone = false;
    const close = (): void => {
      if (current.length > 0) {
        paragraphs.push({
          page,
          lines: current,
          readsAsHeading: current.length === 1 && currentStandalone,
        });
      }
      current = [];
    };
    lines.forEach((line, i) => {
      const prev = current[current.length - 1];
      if (
        prev &&
        (standalone[i] ||
          standalone[i - 1] ||
          Math.abs(line.size - prev.size) > 0.5 ||
          !tight(prev, line) ||
          LIST_MARKER.test(line.text))
      ) {
        close();
      }
      current.push(line);
      currentStandalone = standalone[i];
    });
    close();
  }

  const isHeading = ({
    lines,
    readsAsHeading,
  }: (typeof paragraphs)[number]): boolean =>
    readsAsHeading ||
    (lines[0].size >= bodySize * 1.12 &&
      lines.map((l) => l.text).join(' ').length <= 200);
  const headingSizes = [
    ...new Set(paragraphs.filter(isHeading).map((p) => round(p.lines[0].size))),
  ].sort((a, b) => b - a);
  const titleSize =
    headingSizes.length > 1 && headingSizes[0] > headingSizes[1] + 0.5
      ? headingSizes[0]
      : undefined;
  const firstPage = kept[0]?.page;

  return paragraphs.map((paragraph): LayoutItem => {
    const { page, lines } = paragraph;
    const text = lines.map((l) => l.text).join(' ');
    if (!isHeading(paragraph)) return { kind: 'text', text, page };
    const title = page === firstPage && round(lines[0].size) === titleSize;
    return { kind: title ? 'title' : 'heading', text, page };
  });
}

/**
 * Page numbers in the top or bottom margin, and lines repeated in a margin on at least half the
 * pages (running headers and footers). OCR's layout drops them too.
 */
function dropPageFurniture(pages: PageText[]): PageText[] {
  const inMargin = (line: TextLine, height: number): boolean =>
    line.top < height * 0.08 || line.top > height * 0.92;
  const key = (text: string): string =>
    text.toLowerCase().replace(/[\d٠-٩]+/g, '#');

  const seen = new Map<string, Set<number>>();
  for (const { page, height, lines } of pages) {
    for (const line of lines) {
      if (!inMargin(line, height)) continue;
      const pagesWith = seen.get(key(line.text)) ?? new Set<number>();
      pagesWith.add(page);
      seen.set(key(line.text), pagesWith);
    }
  }
  const repeated = (text: string): boolean =>
    pages.length >= 2 &&
    (seen.get(key(text))?.size ?? 0) >=
      Math.max(2, Math.ceil(pages.length / 2));

  return pages.map((page) => ({
    ...page,
    lines: page.lines.filter(
      (line) =>
        !inMargin(line, page.height) ||
        !(PAGE_NUMBER.test(line.text) || repeated(line.text)),
    ),
  }));
}

/** The font size carrying the most characters: the body text's. */
function mostCommonSize(lines: TextLine[]): number {
  const chars = new Map<number, number>();
  for (const line of lines) {
    const size = round(line.size);
    chars.set(size, (chars.get(size) ?? 0) + line.text.length);
  }
  let best = 0;
  let bestChars = -1;
  for (const [size, count] of chars) {
    if (count > bestChars) [best, bestChars] = [size, count];
  }
  return best;
}

function round(size: number): number {
  return Math.round(size * 2) / 2;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
