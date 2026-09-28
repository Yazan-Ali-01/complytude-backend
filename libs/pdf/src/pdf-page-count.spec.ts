import { PDFDocument } from 'pdf-lib';
import { countPdfPages, UnreadablePdfError } from './pdf-page-count';

async function pdfWithPages(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return doc.save();
}

describe('countPdfPages', () => {
  it('counts the pages of a PDF', async () => {
    await expect(countPdfPages(await pdfWithPages(3))).resolves.toBe(3);
    await expect(countPdfPages(await pdfWithPages(120))).resolves.toBe(120);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(
      countPdfPages(Buffer.from('definitely not a pdf')),
    ).rejects.toBeInstanceOf(UnreadablePdfError);
  });
});
