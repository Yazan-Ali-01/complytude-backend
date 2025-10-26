/**
 * Mock for file-type ES module
 * This allows Jest to handle the ESM-only file-type package
 */

export const fileTypeFromBuffer = (
  buffer: Buffer,
): { ext: string; mime: string } | undefined => {
  // Simple mock implementation based on buffer content
  const bufferString = buffer.toString('utf-8', 0, 20);

  // PDF
  if (bufferString.startsWith('%PDF')) {
    return { ext: 'pdf', mime: 'application/pdf' };
  }

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return { ext: 'png', mime: 'image/png' };
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // DOCX (zip-based)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return {
      ext: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // Default for unknown
  return undefined;
};

export default { fileTypeFromBuffer };
