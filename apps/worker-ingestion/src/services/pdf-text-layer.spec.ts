import { pdfWith } from '@lib/pdf/testing/pdf-fixtures';
import {
  countUsable,
  layoutFromTextLayer,
  linesOf,
  readTextLayer,
  UnreadableTextLayerError,
  type PageText,
  type TextLine,
  type TextRun,
} from './pdf-text-layer';

const HEIGHT = 842;

function run(
  text: string,
  x: number,
  y: number,
  options: Partial<TextRun> = {},
): TextRun {
  return {
    text,
    x,
    y,
    width: text.length * 6,
    size: 12,
    rtl: false,
    ...options,
  };
}

/** A page of lines, `top` counted from the top of the page. */
function page(
  number: number,
  lines: Array<[text: string, top: number, size?: number]>,
): PageText {
  return {
    page: number,
    height: HEIGHT,
    usableChars: 100,
    lines: lines.map(
      ([text, top, size = 12]): TextLine => ({ text, top, size, rtl: false }),
    ),
  };
}

describe('pdf text layer', () => {
  describe('readTextLayer', () => {
    it("reads each page's lines and counts the letters and digits in them", async () => {
      const pages = await readTextLayer(
        await pdfWith([['Clause 1', 'The term is two years.'], 'scan']),
      );

      expect(pages.map((p) => p.lines.map((l) => l.text))).toEqual([
        ['Clause 1', 'The term is two years.'],
        [],
      ]);
      expect(pages.map((p) => p.usableChars)).toEqual([24, 0]);
    });

    it('refuses bytes that are not a PDF', async () => {
      await expect(
        readTextLayer(Buffer.from('not a pdf at all')),
      ).rejects.toBeInstanceOf(UnreadableTextLayerError);
    });
  });

  describe('linesOf', () => {
    it('joins runs on a baseline, with a space only where there is a gap', () => {
      const lines = linesOf(
        [
          run('15 March 2026', 105.7, 700),
          run('Date:', 72, 700, { width: 30 }),
          run('Agree', 72, 680, { width: 30 }),
          run('ment', 102, 680),
        ],
        HEIGHT,
      );

      expect(lines.map((l) => l.text)).toEqual([
        'Date: 15 March 2026',
        'Agreement',
      ]);
      expect(lines[0].top).toBe(HEIGHT - 700);
    });

    it('reads a right-to-left line from the right', () => {
      const [line] = linesOf(
        [
          run('ثماني ساعات', 300, 700, { rtl: true, width: 80 }),
          run('يعمل الموظف', 400, 700, { rtl: true, width: 80 }),
        ],
        HEIGHT,
      );

      expect(line).toMatchObject({
        text: 'يعمل الموظف ثماني ساعات',
        rtl: true,
      });
    });

    it('reads a bilingual page column by column, English first', () => {
      const runs = Array.from({ length: 12 }, (_, i) => [
        run(`English clause ${i + 1}`, 50, 780 - i * 20, { width: 200 }),
        run(`البند ${i + 1}`, 320, 780 - i * 20, { rtl: true, width: 200 }),
      ]).flat();

      const lines = linesOf(runs, HEIGHT).map((l) => l.text);

      expect(lines.slice(0, 12)).toEqual(
        Array.from({ length: 12 }, (_, i) => `English clause ${i + 1}`),
      );
      expect(lines.slice(12)).toEqual(
        Array.from({ length: 12 }, (_, i) => `البند ${i + 1}`),
      );
    });

    it('keeps a single column whole when lines only have a wide gap now and then', () => {
      const runs = Array.from({ length: 12 }, (_, i) =>
        run(
          'The Employee shall perform the duties of the role in good faith.',
          72,
          780 - i * 20,
          { width: 450 },
        ),
      );
      runs.push(run('Signed:', 72, 400), run('Date:', 400, 400));

      expect(linesOf(runs, HEIGHT).at(-1)?.text).toBe('Signed: Date:');
    });
  });

  describe('layoutFromTextLayer', () => {
    it('drops page numbers and running headers or footers, not body text', () => {
      const pages = [1, 2, 3].map((n) =>
        page(n, [
          ['CONFIDENTIAL', 30],
          [`Clause ${n} text that the parties agreed.`, 200],
          [`Page ${n} of 3`, 815],
        ]),
      );

      expect(layoutFromTextLayer(pages).map((i) => i.text)).toEqual([
        'Clause 1 text that the parties agreed.',
        'Clause 2 text that the parties agreed.',
        'Clause 3 text that the parties agreed.',
      ]);
    });

    it('joins lines into paragraphs by their spacing, and splits list items', () => {
      const items = layoutFromTextLayer([
        page(1, [
          ['The Employee shall work forty-eight hours', 100],
          ['a week at the Dubai office.', 114],
          ['Overtime is paid at the rates of the Labour Law.', 150],
          ['(a) on weekdays, 125 per cent;', 164],
          ['(b) at night, 150 per cent.', 178],
        ]),
      ]);

      expect(items.map((i) => i.text)).toEqual([
        'The Employee shall work forty-eight hours a week at the Dubai office.',
        'Overtime is paid at the rates of the Labour Law.',
        '(a) on weekdays, 125 per cent;',
        '(b) at night, 150 per cent.',
      ]);
      expect(items.every((i) => i.kind === 'text')).toBe(true);
    });

    it('finds headings by size, a wrapped one included, and the title on the first page', () => {
      const items = layoutFromTextLayer([
        page(1, [
          ['SERVICES AGREEMENT', 80, 20],
          ['SECTION 1 — SCOPE OF THE SERVICES AND', 120, 16],
          ['DELIVERABLES', 138, 16],
          ['The Provider delivers the services in the Schedule.', 170],
          ['The Client pays within thirty days of an invoice.', 184],
        ]),
      ]);

      expect(items).toEqual([
        { kind: 'title', text: 'SERVICES AGREEMENT', page: 1 },
        {
          kind: 'heading',
          text: 'SECTION 1 — SCOPE OF THE SERVICES AND DELIVERABLES',
          page: 1,
        },
        {
          kind: 'text',
          text: 'The Provider delivers the services in the Schedule. The Client pays within thirty days of an invoice.',
          page: 1,
        },
      ]);
    });

    it('takes body-size lines that read as headings as headings, even tightly spaced', () => {
      const items = layoutFromTextLayer([
        page(1, [
          ['ARTICLE 5 — TERM', 100],
          ['This Agreement runs for two years from signature.', 114],
          ['المادة 6 - الإنهاء', 140],
          ['1.4 Bearer Share Certificates', 170],
          ['The Company shall not issue bearer shares.', 184],
        ]),
      ]);

      expect(items.map((i) => [i.kind, i.text])).toEqual([
        ['heading', 'ARTICLE 5 — TERM'],
        ['text', 'This Agreement runs for two years from signature.'],
        ['heading', 'المادة 6 - الإنهاء'],
        ['heading', '1.4 Bearer Share Certificates'],
        ['text', 'The Company shall not issue bearer shares.'],
      ]);
    });

    it('keeps a paragraph written in capitals as text', () => {
      const items = layoutFromTextLayer([
        page(1, [
          ['IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR', 100],
          ['ANY INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL LOSS', 114],
          ['ARISING OUT OF OR IN CONNECTION WITH THIS AGREEMENT.', 128],
        ]),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].kind).toBe('text');
    });
  });

  it('counts letters and digits in any script, not symbols or spaces', () => {
    expect(countUsable('Art. 5: 48 ساعة — • ')).toBe(10);
  });
});
