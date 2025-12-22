/**
 * Format bytes into human-readable file size
 * @param bytes - Size in bytes
 * @returns Formatted string with appropriate unit (B, KB, MB, GB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const decimals = 2;

  if (bytes < k) {
    return `${bytes} B`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(decimals)} ${units[i]}`;
}

export function isMulterLikeFile(file: unknown): boolean {
  if (!file || typeof file !== 'object') {
    return false;
  }
  const f = file as Record<string, unknown>;
  return (
    typeof f.fieldname === 'string' &&
    typeof f.originalname === 'string' &&
    typeof f.encoding === 'string' &&
    typeof f.mimetype === 'string' &&
    Buffer.isBuffer(f.buffer) &&
    typeof f.size === 'number'
  );
}
