export const TEMPLATE_PLACEHOLDER_DELIMITERS: { start: string; end: string } = {
  start: '{{',
  end: '}}',
};

export const TEMPLATE_ALLOWED_MIME_TYPES: string[] = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const TEMPLATE_MAX_FILE_SIZE: number = 5 * 1024 * 1024; // 5MB

export const TEMPLATE_DOWNLOAD_URL_EXPIRES_IN: number = 900; // 15 minutes

/** Limits on a DOCX's ZIP contents, checked before anything inflates it (zip bombs). */
export const TEMPLATE_DOCX_LIMITS = {
  maxEntries: 500,
  maxEntryUncompressedBytes: 25 * 1024 * 1024,
  maxTotalUncompressedBytes: 50 * 1024 * 1024,
} as const;
