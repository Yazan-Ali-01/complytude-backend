import { inflateRawSync } from 'node:zlib';
import { TEMPLATE_DOCX_LIMITS } from '../constants/template.constants';

/** Why an uploaded file is not accepted as a DOCX. */
export class UnsafeDocxError extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const ZIP64_MARKER_16 = 0xffff;
const STORED = 0;
const DEFLATE = 8;
const REQUIRED_PARTS = ['[Content_Types].xml', 'word/document.xml'];

function findEndOfCentralDirectory(buffer: Buffer): number {
  const lowest = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE);
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= lowest; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new UnsafeDocxError('not a ZIP archive');
}

/**
 * Checks an uploaded DOCX before any library unzips it. Walks the ZIP central directory and
 * inflates each entry with its output capped at the size it declares, so a zip bomb (tiny file,
 * huge contents) or a lying size header is rejected without ever being inflated in full.
 */
export function assertSafeDocx(buffer: Buffer): void {
  if (buffer.length < EOCD_MIN_SIZE) {
    throw new UnsafeDocxError('file too small to be a ZIP archive');
  }

  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === ZIP64_MARKER_16 || directoryOffset === ZIP64_MARKER_32) {
    throw new UnsafeDocxError('ZIP64 archives are not accepted');
  }
  if (entryCount > TEMPLATE_DOCX_LIMITS.maxEntries) {
    throw new UnsafeDocxError(`too many entries (${entryCount})`);
  }

  const names = new Set<string>();
  let total = 0;
  let offset = directoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE
    ) {
      throw new UnsafeDocxError('corrupt central directory');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const declaredSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x1) throw new UnsafeDocxError(`encrypted entry ${name}`);
    if (
      compressedSize === ZIP64_MARKER_32 ||
      declaredSize === ZIP64_MARKER_32
    ) {
      throw new UnsafeDocxError('ZIP64 archives are not accepted');
    }
    if (declaredSize > TEMPLATE_DOCX_LIMITS.maxEntryUncompressedBytes) {
      throw new UnsafeDocxError(`entry ${name} is too large`);
    }
    total += declaredSize;
    if (total > TEMPLATE_DOCX_LIMITS.maxTotalUncompressedBytes) {
      throw new UnsafeDocxError('uncompressed contents are too large');
    }

    if (
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== LOCAL_HEADER_SIGNATURE
    ) {
      throw new UnsafeDocxError(`corrupt local header for ${name}`);
    }
    const dataStart =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) {
      throw new UnsafeDocxError(`truncated entry ${name}`);
    }
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    let actualSize: number;
    if (method === STORED) {
      actualSize = data.length;
    } else if (method === DEFLATE) {
      try {
        // Throws once the output passes the declared size: a lying header can't inflate further
        actualSize = inflateRawSync(data, {
          maxOutputLength: Math.max(declaredSize, 1),
        }).length;
      } catch {
        throw new UnsafeDocxError(`entry ${name} inflates past its size`);
      }
    } else {
      throw new UnsafeDocxError(`unsupported compression for ${name}`);
    }
    if (actualSize !== declaredSize) {
      throw new UnsafeDocxError(`entry ${name} does not match its size`);
    }
    names.add(name);
  }

  for (const part of REQUIRED_PARTS) {
    if (!names.has(part)) throw new UnsafeDocxError(`missing ${part}`);
  }
}
