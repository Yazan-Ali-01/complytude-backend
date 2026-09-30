import type {
  AnalyzeParagraph,
  AnalyzeResult,
} from './document-intelligence.client';
import { parseLayoutResult } from './document-intelligence.service';
import { sectionsFromLayout } from './document-layout';

let offset = 0;

/** A paragraph in the shape `prebuilt-layout` returns; offsets follow the order of creation. */
function paragraph(
  content: string,
  page: number,
  role?: string,
): AnalyzeParagraph {
  const span = { offset, length: content.length };
  offset += content.length + 1;
  return {
    ...(role ? { role } : {}),
    content,
    boundingRegions: [{ pageNumber: page }],
    spans: [span],
  };
}

function pages(count: number, confidence = 0.99): AnalyzeResult['pages'] {
  return Array.from({ length: count }, (_, i) => ({
    pageNumber: i + 1,
    words: [{ content: 'word', confidence }],
  }));
}

/** The result as ingestion stores it: sections and flat text. */
function parse(
  result: AnalyzeResult,
): ReturnType<typeof parseLayoutResult> &
  ReturnType<typeof sectionsFromLayout> {
  const parsed = parseLayoutResult(result);
  return { ...parsed, ...sectionsFromLayout(parsed.items) };
}

/**
 * Document Intelligence layout → sections and flat text: content order, headings split sections,
 * headers/footers/page numbers dropped, lines as the fallback.
 */
describe('parseLayoutResult', () => {
  it('builds sections in reading order across pages, headings starting new ones', () => {
    const title = paragraph('EMPLOYMENT AGREEMENT', 1, 'title');
    const header1 = paragraph('1. Working hours', 1, 'sectionHeading');
    const hours = paragraph('The employee works 48 hours a week.', 1);
    const pageNumber = paragraph('Page 1 of 2', 1, 'pageNumber');
    const running = paragraph('CONFIDENTIAL', 2, 'pageHeader');
    const header2 = paragraph('2. Remuneration', 2, 'sectionHeading');
    const salary = paragraph('Salary is AED 10,000 per month.', 2);
    const footer = paragraph('Initials: ____', 2, 'pageFooter');

    // Deliberately shuffled: the order is the content's, not the array's
    const result = parse({
      pages: pages(2),
      paragraphs: [
        salary,
        title,
        header2,
        footer,
        hours,
        header1,
        running,
        pageNumber,
      ],
    });

    expect(result.sections).toEqual([
      { heading: 'EMPLOYMENT AGREEMENT', level: 0, content: '', pageStart: 1 },
      {
        heading: '1. Working hours',
        level: 1,
        content: 'The employee works 48 hours a week.',
        pageStart: 1,
      },
      {
        heading: '2. Remuneration',
        level: 1,
        content: 'Salary is AED 10,000 per month.',
        pageStart: 2,
      },
    ]);
    expect(result.text).not.toMatch(/Page 1 of 2|CONFIDENTIAL|Initials/);
    expect(result).toMatchObject({ pageCount: 2, confidence: 0.99 });
  });

  it('reads Arabic paragraphs and headings as they are', () => {
    const result = parse({
      pages: pages(1, 0.97),
      paragraphs: [
        paragraph('عقد عمل', 1, 'title'),
        paragraph('المادة 1: ساعات العمل', 1, 'sectionHeading'),
        paragraph('يعمل الموظف ثماني ساعات يومياً،\nخمسة أيام في الأسبوع.', 1),
      ],
    });

    expect(result.sections).toEqual([
      { heading: 'عقد عمل', level: 0, content: '', pageStart: 1 },
      {
        heading: 'المادة 1: ساعات العمل',
        level: 1,
        content: 'يعمل الموظف ثماني ساعات يومياً، خمسة أيام في الأسبوع.',
        pageStart: 1,
      },
    ]);
    expect(result.confidence).toBe(0.97);
  });

  it('keeps text before the first heading, and footnotes, as text', () => {
    const result = parse({
      pages: pages(1),
      paragraphs: [
        paragraph('Preamble text.', 1),
        paragraph('Clause 1', 1, 'sectionHeading'),
        paragraph('a) first item', 1),
        paragraph('1 As amended in 2024.', 1, 'footnote'),
      ],
    });

    expect(result.sections).toEqual([
      { heading: null, level: 1, content: 'Preamble text.', pageStart: 1 },
      {
        heading: 'Clause 1',
        level: 1,
        content: 'a) first item\n1 As amended in 2024.',
        pageStart: 1,
      },
    ]);
  });

  it("falls back to each page's lines when there are no paragraphs", () => {
    const result = parse({
      pages: [
        { pageNumber: 2, lines: [{ content: 'page two' }] },
        {
          pageNumber: 1,
          lines: [{ content: 'first' }, { content: 'second' }],
        },
        { pageNumber: 3, lines: [] },
      ],
    });

    expect(result.items).toEqual([
      { kind: 'text', text: 'first\nsecond', page: 1 },
      { kind: 'text', text: 'page two', page: 2 },
    ]);
    expect(result).toMatchObject({ pageCount: 3, confidence: undefined });
  });

  it('reads an empty result as no text', () => {
    expect(parseLayoutResult({})).toEqual({
      items: [],
      pageCount: 0,
      confidence: undefined,
    });
  });
});
