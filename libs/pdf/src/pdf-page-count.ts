import { PDFDocument } from 'pdf-lib';

/** Thrown when the bytes can't be read as a PDF. */
export class UnreadablePdfError extends Error {}

/**
 * Pages in a PDF, read from its page tree without rendering anything. Used to refuse documents
 * over the extraction limit before paying for them (Textract bills per page).
 */
export async function countPdfPages(pdf: Uint8Array): Promise<number> {
  try {
    const document = await PDFDocument.load(pdf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return document.getPageCount();
  } catch (error) {
    throw new UnreadablePdfError(
      `Not a readable PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
