/**
 * Mock for ESM-only file-type package (Jest cannot resolve it in CommonJS mode).
 * NOTE: Always returns a valid result. Real fileTypeFromBuffer can return undefined
 * for unrecognized files — test accordingly when writing file-upload integration tests.
 */
export async function fileTypeFromBuffer(
  _buffer: Buffer | Uint8Array,
): Promise<{ mime: string; ext: string } | undefined> {
  return { mime: 'application/octet-stream', ext: 'bin' };
}
