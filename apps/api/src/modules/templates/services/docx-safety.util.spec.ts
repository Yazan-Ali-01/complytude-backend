import PizZip from 'pizzip';
import { assertSafeDocx, UnsafeDocxError } from './docx-safety.util';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const DOCUMENT =
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>';

function zip(files: Record<string, string | Buffer>): Buffer {
  const archive = new PizZip();
  for (const [name, content] of Object.entries(files)) {
    archive.file(name, content);
  }
  return archive.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function docx(extra: Record<string, string | Buffer> = {}): Buffer {
  return zip({
    '[Content_Types].xml': CONTENT_TYPES,
    'word/document.xml': DOCUMENT,
    ...extra,
  });
}

/** Rewrites every size header of the named entry to claim `size` bytes. */
function lieAboutSize(buffer: Buffer, name: string, size: number): Buffer {
  const out = Buffer.from(buffer);
  for (let i = 0; i < out.length - 4; i++) {
    const signature = out.readUInt32LE(i);
    if (signature === 0x04034b50) {
      const nameLength = out.readUInt16LE(i + 26);
      if (out.toString('utf8', i + 30, i + 30 + nameLength) === name) {
        out.writeUInt32LE(size, i + 22);
      }
    } else if (signature === 0x02014b50) {
      const nameLength = out.readUInt16LE(i + 28);
      if (out.toString('utf8', i + 46, i + 46 + nameLength) === name) {
        out.writeUInt32LE(size, i + 24);
      }
    }
  }
  return out;
}

describe('assertSafeDocx', () => {
  it('accepts a well-formed DOCX', () => {
    expect(() => assertSafeDocx(docx())).not.toThrow();
  });

  it('rejects a file that is not a ZIP', () => {
    expect(() => assertSafeDocx(Buffer.from('%PDF-1.7 '.repeat(10)))).toThrow(
      UnsafeDocxError,
    );
  });

  it('rejects a ZIP that is not a DOCX', () => {
    expect(() => assertSafeDocx(zip({ 'readme.txt': 'hello' }))).toThrow(
      /missing/,
    );
  });

  it('rejects an entry that declares a huge uncompressed size', () => {
    // 30 MB of zeros compresses to about 30 KB
    const bomb = docx({
      'word/media/bomb.bin': Buffer.alloc(30 * 1024 * 1024),
    });
    expect(bomb.length).toBeLessThan(100 * 1024);

    expect(() => assertSafeDocx(bomb)).toThrow(/too large/);
  });

  it('rejects a bomb whose headers lie about its size, without inflating it', () => {
    const bomb = lieAboutSize(
      docx({ 'word/media/bomb.bin': Buffer.alloc(20 * 1024 * 1024) }),
      'word/media/bomb.bin',
      1024,
    );

    expect(() => assertSafeDocx(bomb)).toThrow(/inflates past its size/);
  });

  it('rejects too many entries', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [`word/part${i}.xml`, '<x/>']),
    );
    expect(() => assertSafeDocx(docx(entries))).toThrow(/too many entries/);
  });
});
