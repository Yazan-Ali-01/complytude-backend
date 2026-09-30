import type { Block } from '@aws-sdk/client-textract';
import { PermanentError } from '@lib/queue';
import { sectionsFromLayout } from './document-layout';
import { parseLayoutBlocks } from './textract.service';

let nextId = 0;

/** A LINE block and the LAYOUT block that owns it, in the shape Textract returns. */
function layout(
  type: string,
  text: string,
  page: number,
  top: number,
): Block[] {
  const lineId = `line-${nextId++}`;
  return [
    {
      Id: lineId,
      BlockType: 'LINE',
      Text: text,
      Page: page,
      Confidence: 99,
      Geometry: { BoundingBox: { Top: top } },
    },
    {
      Id: `layout-${nextId++}`,
      BlockType: type as Block['BlockType'],
      Page: page,
      Geometry: { BoundingBox: { Top: top } },
      Relationships: [{ Type: 'CHILD', Ids: [lineId] }],
    },
  ];
}

/** Textract's result as ingestion stores it: sections and flat text. */
function parse(
  blocks: Block[],
  jobId: string,
  maxPages: number,
): ReturnType<typeof parseLayoutBlocks> &
  ReturnType<typeof sectionsFromLayout> {
  const result = parseLayoutBlocks(blocks, jobId, maxPages);
  return { ...result, ...sectionsFromLayout(result.items) };
}

/**
 * Textract LAYOUT output → sections and flat text: reading order (page, then position), headings
 * split sections, headers/footers/page numbers dropped, LINE fallback without LAYOUT, page limit.
 */
describe('parseLayoutBlocks', () => {
  it('builds sections in reading order across pages, headings starting new ones', () => {
    // Deliberately shuffled: Textract doesn't promise order
    const blocks = [
      ...layout('LAYOUT_TEXT', 'Salary is AED 10,000 per month.', 2, 0.3),
      ...layout('LAYOUT_TITLE', 'EMPLOYMENT AGREEMENT', 1, 0.05),
      ...layout('LAYOUT_SECTION_HEADER', '2. Remuneration', 2, 0.1),
      ...layout('LAYOUT_TEXT', 'The employee works 48 hours a week.', 1, 0.4),
      ...layout('LAYOUT_SECTION_HEADER', '1. Working hours', 1, 0.2),
      ...layout('LAYOUT_PAGE_NUMBER', 'Page 1 of 2', 1, 0.95),
      ...layout('LAYOUT_HEADER', 'CONFIDENTIAL', 2, 0.01),
    ];

    const result = parse(blocks, 'job-1', 50);

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
    expect(result.text).not.toMatch(/Page 1 of 2|CONFIDENTIAL/);
    expect(result.text.indexOf('Working hours')).toBeLessThan(
      result.text.indexOf('Remuneration'),
    );
    expect(result).toMatchObject({
      pageCount: 2,
      confidence: 99,
      textractJobId: 'job-1',
    });
  });

  it('keeps text before the first heading in an untitled section', () => {
    const blocks = [
      ...layout('LAYOUT_TEXT', 'Preamble text.', 1, 0.1),
      ...layout('LAYOUT_SECTION_HEADER', 'Clause 1', 1, 0.5),
      ...layout('LAYOUT_LIST', 'a) first item', 1, 0.6),
    ];

    expect(parse(blocks, 'job-2', 50).sections).toEqual([
      { heading: null, level: 1, content: 'Preamble text.', pageStart: 1 },
      { heading: 'Clause 1', level: 1, content: 'a) first item', pageStart: 1 },
    ]);
  });

  it('falls back to lines by page when there is no layout output', () => {
    const lines: Block[] = [
      {
        Id: 'b',
        BlockType: 'LINE',
        Text: 'second',
        Page: 1,
        Geometry: { BoundingBox: { Top: 0.5 } },
      },
      {
        Id: 'c',
        BlockType: 'LINE',
        Text: 'page two',
        Page: 2,
        Geometry: { BoundingBox: { Top: 0.1 } },
      },
      {
        Id: 'a',
        BlockType: 'LINE',
        Text: 'first',
        Page: 1,
        Geometry: { BoundingBox: { Top: 0.1 } },
      },
    ];

    const result = parse(lines, 'job-3', 50);

    expect(result.items).toEqual([
      { kind: 'text', text: 'first\nsecond', page: 1 },
      { kind: 'text', text: 'page two', page: 2 },
    ]);
    expect(result.text).toBe('first\nsecond\npage two');
  });

  it('refuses a document over the page limit', () => {
    const blocks = [1, 2, 3].flatMap((page) =>
      layout('LAYOUT_TEXT', `page ${page}`, page, 0.1),
    );

    expect(() => parseLayoutBlocks(blocks, 'job-4', 2)).toThrow(PermanentError);
  });
});
