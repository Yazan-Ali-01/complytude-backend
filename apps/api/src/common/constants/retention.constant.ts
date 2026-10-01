/**
 * Days a deleted document stays in the trash, restorable, before the daily retention sweep erases
 * it (decision D-7).
 */
export const DOCUMENT_TRASH_DAYS = 30;

/** Days after a user deletes their account before its names and email are erased (D-7). */
export const ACCOUNT_ANONYMIZATION_DAYS = 30;

/**
 * Audit rows: IP address and user agent are blanked after AUDIT_CLIENT_DETAILS_DAYS, the rows
 * deleted after AUDIT_LOG_RETENTION_YEARS (D-7). Migration 049's policies allow no younger row to
 * be touched: change both together.
 */
export const AUDIT_CLIENT_DETAILS_DAYS = 90;
export const AUDIT_LOG_RETENTION_YEARS = 2;
