/**
 * Deep merge two objects recursively.
 *
 * - Nested plain objects are merged recursively
 * - Arrays are replaced (not concatenated) to avoid ambiguity
 * - `null` explicitly clears a value
 * - `undefined` is skipped (treated as "not provided")
 * - Date instances, RegExp, etc. are treated as values (replaced, not recursed)
 * - Inputs are never mutated; returns a new object
 *
 * @param target - Base object
 * @param source - Object to merge into target
 * @returns New merged object
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === undefined) {
      continue;
    }

    if (sourceValue === null) {
      (result as Record<string, unknown>)[key] = null;
      continue;
    }

    const isTargetPlainObject =
      targetValue !== null &&
      targetValue !== undefined &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue) &&
      !((targetValue as unknown) instanceof Date);

    const isSourcePlainObject =
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      !((sourceValue as unknown) instanceof Date);

    if (isTargetPlainObject && isSourcePlainObject) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}
