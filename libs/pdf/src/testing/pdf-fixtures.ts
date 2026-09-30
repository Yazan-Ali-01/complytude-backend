import { PDFDocument, StandardFonts } from 'pdf-lib';
import { crc32, deflateSync } from 'node:zlib';

// Test fixtures only: PDFs shaped like the uploads ingestion sees.

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), data.length + 8);
  return out;
}

/** A small grey PNG, standing in for a scanner's page image. */
export function greyPng(width = 8, height = 8): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth; colour type 0: greyscale
  const rows = Buffer.alloc((width + 1) * height, 0x80);
  for (let row = 0; row < height; row++) rows[row * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A PDF whose pages are each either lines of text (a text layer, as a word processor exports) or
 * `'scan'`: a page that is only an image, as a scanner makes.
 */
export async function pdfWith(
  pages: Array<string[] | 'scan'>,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const image = await document.embedPng(greyPng());
  for (const content of pages) {
    const page = document.addPage([595, 842]);
    if (content === 'scan') {
      page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
      continue;
    }
    content.forEach((line, i) =>
      page.drawText(line, { x: 72, y: 760 - i * 16, size: 12, font }),
    );
  }
  return document.save();
}
