import { PDFDocument } from 'pdf-lib';
import { countPdfPages, UnreadablePdfError } from './pdf-page-count';
import { copyPdfPages, pagesWithImages } from './pdf-pages';
import { greyPng, pdfWith } from './testing/pdf-fixtures';

describe('pagesWithImages', () => {
  it('finds the pages that draw an image, not the text-only ones', async () => {
    const pdf = await pdfWith([
      ['Text page'],
      'scan',
      ['Another text page'],
      'scan',
    ]);

    await expect(pagesWithImages(pdf, [1, 2, 3, 4])).resolves.toEqual([2, 4]);
    await expect(pagesWithImages(pdf, [1, 3, 9])).resolves.toEqual([]);
  });

  it('finds an image drawn inside a form', async () => {
    const inner = await PDFDocument.create();
    const image = await inner.embedPng(greyPng());
    inner.addPage([100, 100]).drawImage(image, { x: 0, y: 0 });
    const outer = await PDFDocument.create();
    const [form] = await outer.embedPdf(await inner.save());
    outer.addPage([100, 100]).drawPage(form);
    outer.addPage([100, 100]);

    await expect(pagesWithImages(await outer.save(), [1, 2])).resolves.toEqual([
      1,
    ]);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(
      pagesWithImages(Buffer.from('not a pdf'), [1]),
    ).rejects.toBeInstanceOf(UnreadablePdfError);
  });
});

describe('copyPdfPages', () => {
  it('makes a PDF of just the chosen pages, in order', async () => {
    const pdf = await pdfWith([['one'], 'scan', ['three'], 'scan', ['five']]);

    const copy = await copyPdfPages(pdf, [2, 4]);

    await expect(countPdfPages(copy)).resolves.toBe(2);
    await expect(pagesWithImages(copy, [1, 2])).resolves.toEqual([1, 2]);
  });
});
