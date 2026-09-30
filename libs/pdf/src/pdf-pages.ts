import { PDFDict, PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import { UnreadablePdfError } from './pdf-page-count';

async function load(pdf: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(pdf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (error) {
    throw new UnreadablePdfError(
      `Not a readable PDF: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Which of these pages (1-based) draw an image: an image XObject in their resources, directly or
 * inside a form. Read from the page objects; no image is decoded.
 */
export async function pagesWithImages(
  pdf: Uint8Array,
  pages: number[],
): Promise<number[]> {
  const all = (await load(pdf)).getPages();
  return pages.filter((n) => {
    const page = all[n - 1];
    return page !== undefined && hasImage(page.node.Resources(), 0);
  });
}

function hasImage(resources: PDFDict | undefined, depth: number): boolean {
  // Forms can nest, or refer to themselves in a crafted file
  if (!resources || depth > 4) return false;
  const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return false;
  for (const [, ref] of xobjects.entries()) {
    const object = xobjects.context.lookup(ref);
    if (!(object instanceof PDFStream)) continue;
    const subtype = object.dict.lookup(PDFName.of('Subtype'));
    if (subtype === PDFName.of('Image')) return true;
    if (
      subtype === PDFName.of('Form') &&
      hasImage(
        object.dict.lookupMaybe(PDFName.of('Resources'), PDFDict),
        depth + 1,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** A new PDF holding only these pages (1-based) of `pdf`, in this order. */
export async function copyPdfPages(
  pdf: Uint8Array,
  pages: number[],
): Promise<Uint8Array> {
  const source = await load(pdf);
  const target = await PDFDocument.create({ updateMetadata: false });
  const copied = await target.copyPages(
    source,
    pages.map((n) => n - 1),
  );
  for (const page of copied) target.addPage(page);
  return target.save();
}
