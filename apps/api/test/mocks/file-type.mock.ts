/**
 * Mock for ESM-only file-type package (Jest cannot resolve it in CommonJS mode).
 */
export async function fileTypeFromBuffer(
  _buffer: Buffer | Uint8Array,
): Promise<{ mime: string; ext: string } | undefined> {
  return { mime: 'application/octet-stream', ext: 'bin' };
}
