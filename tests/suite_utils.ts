/** Shared helpers for fixture-based test suites (sawn, saws). */

/** Replace JSON sentinel strings with their JS equivalents. */
export const replaceSentinels = (obj: unknown): unknown => {
  if (obj === null) return null;
  if (typeof obj === "string") {
    if (obj === "$$UNDEFINED$$") return undefined;
    if (obj === "$$INF$$") return Infinity;
    if (obj === "$$NEG_INF$$") return -Infinity;
    if (obj === "$$NAN$$") return NaN;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(replaceSentinels);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = replaceSentinels(v);
    }
    return result;
  }
  return obj;
};

/** Deep equality that handles NaN, -0, and nested structures. */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    // Distinguish -0 and +0 (Object.is(0, -0) === false)
    if (Object.is(a, 0) !== Object.is(b, 0)) return false;
    return a === b;
  }
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(
      (k) =>
        k in (b as Record<string, unknown>) &&
        deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
    );
  }
  return false;
};
