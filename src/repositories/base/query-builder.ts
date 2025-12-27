import { Logger } from '@nestjs/common';

/**
 * Supported operators for dynamic WHERE clause generation.
 */
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'LIKE'
  | 'ILIKE'
  | 'IN'
  | 'ANY';

/**
 * Single filter condition used to build a WHERE clause.
 */
export interface QueryCondition {
  field: string;
  value: unknown;
  operator?: FilterOperator;
}

/**
 * Result of building a WHERE clause with parameter placeholders.
 */
export interface WhereClause {
  clause: string;
  params: unknown[];
  nextIndex: number;
}

/**
 * Lightweight SQL query builder for dynamic WHERE/ORDER/LIMIT/OFFSET sections.
 * Keeps parameter numbering correct when composing clauses.
 */
export class QueryBuilder {
  private readonly params: unknown[] = [];
  private readonly conditions: string[] = [];
  private currentIndex: number;
  private static readonly logger = new Logger(QueryBuilder.name);

  constructor(startIndex = 1) {
    this.currentIndex = startIndex;
    QueryBuilder.logger.debug(`constructor: startIndex=${startIndex}`);
  }

  /**
   * Add a single condition to the WHERE clause.
   *
   * Example:
   * ```ts
   * qb.addCondition({ field: 'email', value: 'a@b.com' });
   * qb.addCondition({ field: 'status', value: ['active', 'pending'], operator: 'IN' });
   * ```
   */
  addCondition(condition: QueryCondition): this {
    const operator = condition.operator ?? '=';
    QueryBuilder.logger.debug(
      `addCondition: field=${condition.field}, operator=${operator}, value=${JSON.stringify(
        condition.value,
      )}`,
    );

    if (condition.value === null) {
      const clause =
        operator === '!='
          ? `${condition.field} IS NOT NULL`
          : `${condition.field} IS NULL`;
      this.conditions.push(clause);
      return this;
    }

    if (operator === 'IN') {
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        this.conditions.push('FALSE');
        return this;
      }

      const values = condition.value as unknown[];
      const placeholders = values.map(() => `$${this.nextIndex()}`).join(', ');
      this.params.push(...values);
      this.conditions.push(`${condition.field} IN (${placeholders})`);
      QueryBuilder.logger.debug(
        `addCondition: IN placeholders=${placeholders}, params=${JSON.stringify(
          this.params,
        )}`,
      );
      return this;
    } else if (operator === 'ANY') {
      this.params.push(condition.value);
      const placeholder = `$${this.nextIndex()}`;
      this.conditions.push(`${placeholder} = ANY(${condition.field})`);
      QueryBuilder.logger.debug(
        `addCondition: ANY placeholder=${placeholder}, params=${JSON.stringify(
          this.params,
        )}`,
      );
      return this;
    }

    const placeholder = `$${this.nextIndex()}`;
    this.params.push(condition.value);
    this.conditions.push(`${condition.field} ${operator} ${placeholder}`);
    QueryBuilder.logger.debug(
      `addCondition: placeholder=${placeholder}, params=${JSON.stringify(
        this.params,
      )}`,
    );
    return this;
  }

  /**
   * Add multiple filters in one call, optionally specifying per-field operators.
   *
   * Example:
   * ```ts
   * qb.addFilters(
   *   { created_at: minDate, status: 'active' },
   *   { created_at: '>=' },
   * );
   * ```
   */
  addFilters(
    filters: Record<string, unknown>,
    operators?: Record<string, FilterOperator>,
  ): this {
    QueryBuilder.logger.debug(
      `addFilters: filters=${JSON.stringify(
        filters,
      )}, operators=${JSON.stringify(operators)}`,
    );
    Object.entries(filters ?? {}).forEach(([field, value]) => {
      if (value === undefined) return;

      this.addCondition({
        field,
        value,
        operator: operators?.[field],
      });
    });

    return this;
  }

  /**
   * Build the WHERE clause text and associated parameters.
   *
   * Example:
   * ```ts
   * const { clause, params } = qb.buildWhere();
   * // clause => "WHERE status = $1"
   * // params => ['active']
   * ```
   */
  buildWhere(): WhereClause {
    const clause = this.conditions.length
      ? `WHERE ${this.conditions.join(' AND ')}`
      : '';
    QueryBuilder.logger.debug(
      `buildWhere: clause="${clause}", params=${JSON.stringify(this.params)}`,
    );

    return {
      clause,
      params: this.params,
      nextIndex: this.currentIndex,
    };
  }

  /**
   * Build an ORDER BY clause if a field is provided.
   *
   * Example: `ORDER BY created_at DESC`
   */
  static buildOrderBy(
    orderBy?: string,
    direction: 'ASC' | 'DESC' = 'ASC',
    startIndex = 1,
  ): { clause: string; params: unknown[]; nextIndex: number } {
    if (!orderBy) {
      return { clause: '', params: [], nextIndex: startIndex };
    }

    const normalizedDirection = direction === 'DESC' ? 'DESC' : 'ASC';
    const clause = `ORDER BY $${startIndex} ${normalizedDirection}`;
    const params: string[] = [orderBy];

    QueryBuilder.logger.debug(
      `buildOrderBy: orderBy=${orderBy}, direction=${normalizedDirection}, startIndex=${startIndex}, params=${JSON.stringify(
        params,
      )}`,
    );

    return { clause, params, nextIndex: startIndex + params.length };
  }

  /**
   * Build LIMIT/OFFSET clauses with parameter placeholders.
   *
   * Example:
   * ```ts
   * QueryBuilder.buildPagination(10, 20)
   * // clause => "LIMIT $1 OFFSET $2"
   * // params => [10, 20]
   * ```
   */
  static buildPagination(
    limit?: number,
    offset?: number,
    startIndex = 1,
  ): { clause: string; params: unknown[]; nextIndex: number } {
    QueryBuilder.logger.debug(
      `buildPagination: limit=${limit}, offset=${offset}, startIndex=${startIndex}`,
    );
    const params: unknown[] = [];
    const clauses: string[] = [];
    let currentIndex = startIndex;

    if (typeof limit === 'number') {
      params.push(limit);
      clauses.push(`LIMIT $${currentIndex++}`);
    }

    if (typeof offset === 'number') {
      params.push(offset);
      clauses.push(`OFFSET $${currentIndex++}`);
    }

    QueryBuilder.logger.debug(
      `buildPagination: clause="${clauses.join(
        ' ',
      )}", params=${JSON.stringify(params)}, nextIndex=${currentIndex}`,
    );
    return {
      clause: clauses.join(' '),
      params,
      nextIndex: currentIndex,
    };
  }

  private nextIndex(): number {
    const idx = this.currentIndex++;
    QueryBuilder.logger.debug(`nextIndex: returning=${idx}`);
    return idx;
  }
}
