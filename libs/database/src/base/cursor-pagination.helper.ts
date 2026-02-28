/**
 * Cursor-based pagination helper for efficient, consistent pagination.
 * Uses base64-encoded IDs as cursors for bidirectional navigation.
 */

import {
  CursorPaginationOptions,
  CursorPaginationResult,
  PaginationDirection,
} from './repository.interface';

/** Default number of items per page */
const DEFAULT_PAGE_LIMIT = 50;

/** Maximum allowed items per page */
const MAX_PAGE_LIMIT = 1000;

export interface CursorQueryResult {
  clause: string;
  params: unknown[];
  nextIndex: number;
  orderClause: string;
}

export interface CursorData {
  id: string;
  created_at: Date;
}

export class CursorPaginationHelper {
  static encodeCursor(id: string, created_at: Date): string {
    const cursorData: CursorData = { id, created_at };
    return Buffer.from(JSON.stringify(cursorData), 'utf-8').toString('base64');
  }

  static decodeCursor(cursor: string): CursorData {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);

      if (!parsed.id || !parsed.created_at) {
        throw new Error('Cursor missing required fields');
      }

      if (typeof parsed.id !== 'string') {
        throw new Error('Invalid cursor: id must be a string');
      }

      return {
        id: parsed.id as string,
        created_at: new Date(parsed.created_at as string),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid cursor format: ${message}`);
    }
  }

  static buildCursorQuery(
    direction: PaginationDirection = 'forward',
    cursor: string | null | undefined,
    nextIndex: number,
  ): CursorQueryResult {
    if (!cursor) {
      return {
        clause: '',
        orderClause: 'ORDER BY created_at ASC, id ASC',
        params: [],
        nextIndex,
      };
    }

    const decoded = this.decodeCursor(cursor);
    const operator = direction === 'forward' ? '>' : '<';

    const clause = `(created_at ${operator} $${nextIndex} OR (created_at = $${nextIndex} AND id ${operator} $${nextIndex + 1}))`;

    const orderClause =
      direction === 'forward'
        ? 'ORDER BY created_at ASC, id ASC'
        : 'ORDER BY created_at DESC, id DESC';

    return {
      clause,
      orderClause,
      params: [decoded.created_at, decoded.id],
      nextIndex: nextIndex + 2,
    };
  }

  static buildLimitClause(
    limit: number = 50,
    nextIndex: number,
  ): { clause: string; params: unknown[]; nextIndex: number } {
    return {
      clause: `LIMIT $${nextIndex}`,
      params: [limit + 1],
      nextIndex: nextIndex + 1,
    };
  }

  static createPaginationResponse<T extends { id: string; created_at: Date }>(
    rows: T[],
    limit: number = 50,
    direction: PaginationDirection = 'forward',
    hasInitialCursor: boolean,
  ): CursorPaginationResult<T> {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    if (direction === 'backward') {
      data.reverse();
    }

    const hasNext = direction === 'forward' ? hasMore : hasInitialCursor;
    const hasPrevious = direction === 'forward' ? hasInitialCursor : hasMore;

    const nextCursor =
      hasNext && data.length > 0
        ? this.encodeCursor(
            data[data.length - 1].id,
            data[data.length - 1].created_at,
          )
        : null;
    const prevCursor =
      hasPrevious && data.length > 0
        ? this.encodeCursor(data[0].id, data[0].created_at)
        : null;

    return {
      data,
      nextCursor,
      prevCursor,
      hasNext,
      hasPrevious,
    };
  }

  static validateOptions(
    options?: Partial<CursorPaginationOptions>,
  ): CursorPaginationOptions {
    const limit = options?.limit ?? DEFAULT_PAGE_LIMIT;
    const direction = options?.direction ?? 'forward';

    if (limit <= 0) {
      throw new Error('Limit must be greater than 0');
    }

    if (limit > MAX_PAGE_LIMIT) {
      throw new Error(`Limit cannot exceed ${MAX_PAGE_LIMIT}`);
    }

    if (direction !== 'forward' && direction !== 'backward') {
      throw new Error('Direction must be "forward" or "backward"');
    }

    return {
      cursor: options?.cursor,
      limit,
      direction,
    };
  }
}
