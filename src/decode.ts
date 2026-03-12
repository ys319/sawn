/**
 * Shared decoding functions for Sawn primitive values.
 * Functions take (src, start, end) pointers for lazy string materialization.
 */

import { Ch } from "./constants.ts";
import { SawnError } from "./error.ts";
import { parseIntDirect, tryStringFastPath } from "./hacks.ts";
import type { ParseOptions, SawnValue } from "./types.ts";

/** §3.2: Reserved words that must be quoted when used as keys. */
const RESERVED_WORDS = new Set(["true", "false", "null", "inf", "nan"]);

/** §1.7: Check if src[start..end) is a valid bare identifier: [a-zA-Z_][a-zA-Z0-9_]* */
export const isIdent = (src: string, start: number, end: number): boolean => {
  if (start >= end) return false;
  const c0 = src.charCodeAt(start);
  if (
    !((c0 >= Ch.a && c0 <= Ch.z) || (c0 >= Ch.A && c0 <= Ch.Z) ||
      c0 === Ch.Underscore)
  ) return false;
  for (let i = start + 1; i < end; i++) {
    const c = src.charCodeAt(i);
    if (
      !((c >= Ch.a && c <= Ch.z) || (c >= Ch.A && c <= Ch.Z) ||
        (c >= Ch.Zero && c <= Ch.Nine) || c === Ch.Underscore)
    ) return false;
  }
  return true;
};

/**
 * §3.2: Parse a raw key token (bare IDENT or quoted string). Returns the key string.
 * When `identValidated` is true, the caller (scanKeyEnd) has already verified that
 * the bare key is a valid IDENT, so the isIdent re-scan is skipped.
 */
export const parseKey = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
  identValidated = false,
): string => {
  if (src.charCodeAt(start) === Ch.Quote) {
    const key = parseQuotedString(src, start, end, lineNum);
    // §3.2: empty quoted string as key is a parse error
    if (key === "") {
      throw new SawnError('Empty string "" cannot be used as a key', lineNum);
    }
    return key;
  }
  if (!identValidated && !isIdent(src, start, end)) {
    throw new SawnError(
      `Invalid bare key: "${src.slice(start, end)}"`,
      lineNum,
    );
  }
  // §3.2: reserved words must be quoted when used as keys
  const key = src.slice(start, end);
  if (RESERVED_WORDS.has(key)) {
    throw new SawnError(
      `Bare reserved word "${key}" cannot be used as a key; quote it as '"${key}"'`,
      lineNum,
    );
  }
  return key;
};

/** Check if a string is a reserved word. */
export const isReservedWord = (s: string): boolean => RESERVED_WORDS.has(s);

/** §2.7: Parse a raw value token into a typed SawnValue (bare token resolution). */
export const parseValue = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
  options: ParseOptions = {},
): SawnValue => {
  const len = end - start;
  if (len === 0) throw new SawnError("Empty value", lineNum);

  const c0 = src.charCodeAt(start);

  // §2.1: quoted string
  if (c0 === Ch.Quote) return parseQuotedString(src, start, end, lineNum);

  // §2.3: numbers — 0-9 or '-' followed by digit
  if (c0 >= Ch.Zero && c0 <= Ch.Nine) {
    return parseNumber(src, start, end, lineNum);
  }
  if (c0 === Ch.Dash) {
    if (len > 1) {
      const c1 = src.charCodeAt(start + 1);
      if (c1 >= Ch.Zero && c1 <= Ch.Nine) {
        return parseNumber(src, start, end, lineNum);
      }
      // §2.6: -inf
      if (
        len === 4 &&
        c1 === Ch.i &&
        src.charCodeAt(start + 2) === Ch.n &&
        src.charCodeAt(start + 3) === Ch.f
      ) {
        return handleSpecialNumber(-Infinity, "-Infinity", options);
      }
      // §2.6: -nan is not valid
      if (
        len === 4 &&
        c1 === Ch.n &&
        src.charCodeAt(start + 2) === Ch.a &&
        src.charCodeAt(start + 3) === Ch.n
      ) {
        throw new SawnError("-nan is not valid; use nan", lineNum);
      }
    }
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  }

  // §2.4: true
  if (c0 === Ch.t) {
    if (
      len === 4 &&
      src.charCodeAt(start + 1) === Ch.r &&
      src.charCodeAt(start + 2) === Ch.u &&
      src.charCodeAt(start + 3) === Ch.e
    ) return true;
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  }

  // §2.4: false
  if (c0 === Ch.f) {
    if (
      len === 5 &&
      src.charCodeAt(start + 1) === Ch.a &&
      src.charCodeAt(start + 2) === Ch.l &&
      src.charCodeAt(start + 3) === Ch.s &&
      src.charCodeAt(start + 4) === Ch.e
    ) return false;
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  }

  // §2.5: null / §2.6: nan
  if (c0 === Ch.n) {
    if (
      len === 4 &&
      src.charCodeAt(start + 1) === Ch.u &&
      src.charCodeAt(start + 2) === Ch.l &&
      src.charCodeAt(start + 3) === Ch.l
    ) return null;
    if (
      len === 3 &&
      src.charCodeAt(start + 1) === Ch.a &&
      src.charCodeAt(start + 2) === Ch.n
    ) return handleSpecialNumber(NaN, "NaN", options);
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  }

  // §2.6: inf
  if (c0 === Ch.i) {
    if (
      len === 3 &&
      src.charCodeAt(start + 1) === Ch.n &&
      src.charCodeAt(start + 2) === Ch.f
    ) return handleSpecialNumber(Infinity, "Infinity", options);
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  }

  throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
};

const handleSpecialNumber = (
  value: number,
  strValue: string,
  options: ParseOptions,
): SawnValue => {
  const handling = options.specialNumberHandling ?? "preserve";
  if (handling === "null") return null;
  if (handling === "string") return strValue;
  return value;
};

/**
 * §2.3: Parse a number per RFC 8259 §6.
 * Grammar: -? (0 | [1-9][0-9]*) (.[0-9]+)? ([eE][+-]?[0-9]+)?
 */
export const parseNumber = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
): number => {
  let i = start;
  const fail = (): never => {
    throw new SawnError(`Invalid value: "${src.slice(start, end)}"`, lineNum);
  };

  // Optional minus
  if (src.charCodeAt(i) === Ch.Dash) i++;
  if (i >= end) fail();

  // Integer part
  const intStart = src.charCodeAt(i);
  if (intStart === Ch.Zero) {
    i++;
  } else if (intStart >= Ch.One && intStart <= Ch.Nine) {
    i++;
    while (
      i < end && src.charCodeAt(i) >= Ch.Zero && src.charCodeAt(i) <= Ch.Nine
    ) i++;
  } else {
    fail();
  }

  // §2.3: integer-only fast path (hacks.ts)
  if (i === end) return parseIntDirect(src, start, end);

  // Fractional part
  if (i < end && src.charCodeAt(i) === Ch.Dot) {
    i++;
    if (
      i >= end || src.charCodeAt(i) < Ch.Zero || src.charCodeAt(i) > Ch.Nine
    ) fail();
    i++;
    while (
      i < end && src.charCodeAt(i) >= Ch.Zero && src.charCodeAt(i) <= Ch.Nine
    ) i++;
  }

  // Exponent part
  if (i < end) {
    const ce = src.charCodeAt(i);
    if (ce === Ch.e || ce === Ch.E) {
      i++;
      if (i < end) {
        const sign = src.charCodeAt(i);
        if (sign === Ch.Plus || sign === Ch.Dash) i++;
      }
      if (
        i >= end || src.charCodeAt(i) < Ch.Zero || src.charCodeAt(i) > Ch.Nine
      ) fail();
      i++;
      while (
        i < end && src.charCodeAt(i) >= Ch.Zero && src.charCodeAt(i) <= Ch.Nine
      ) i++;
    }
  }

  if (i !== end) fail();
  // Safe to use Number(): the grammar check above guarantees no leading/trailing whitespace
  return Number(src.slice(start, end));
};

/** Check if a character is a hex digit (0-9, a-f, A-F). */
const isHexDigit = (c: number): boolean =>
  (c >= Ch.Zero && c <= Ch.Nine) ||
  (c >= Ch.a && c <= Ch.f) ||
  (c >= Ch.A && c <= Ch.F);

/** Convert a hex digit character code to its numeric value. */
const hexVal = (c: number): number => {
  if (c >= Ch.Zero && c <= Ch.Nine) return c - Ch.Zero;
  if (c >= Ch.a && c <= Ch.f) return c - Ch.a + 10;
  return c - Ch.A + 10;
};

/** §2.1: Parse a quoted string with escape sequences. */
export const parseQuotedString = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
): string => {
  const len = end - start;
  if (
    len < 2 || src.charCodeAt(start) !== Ch.Quote ||
    src.charCodeAt(end - 1) !== Ch.Quote
  ) {
    throw new SawnError(
      `Invalid quoted string: ${src.slice(start, end)}`,
      lineNum,
    );
  }

  const innerStart = start + 1;
  const innerEnd = end - 1;

  // §2.1: fast path — SIMD hybrid validation (hacks.ts)
  const fast = tryStringFastPath(src, innerStart, innerEnd, lineNum);
  if (fast !== null) return fast;

  // Slow path: segment-based with charCodeAt
  const parts: string[] = [];
  let segStart = innerStart;
  for (let i = innerStart; i < innerEnd; i++) {
    const c = src.charCodeAt(i);
    if (c === Ch.Backslash) {
      if (segStart < i) parts.push(src.slice(segStart, i));
      if (i + 1 >= innerEnd) {
        throw new SawnError("Unterminated escape sequence", lineNum);
      }
      // Each case advances i to the last consumed character of the escape.
      // The for-loop's i++ then moves past it.
      const next = src.charCodeAt(i + 1);
      switch (next) {
        case Ch.Backslash:
          parts.push("\\");
          i++;
          break;
        case Ch.Quote:
          parts.push('"');
          i++;
          break;
        case Ch.Zero:
          parts.push("\0");
          i++;
          break;
        case Ch.a:
          parts.push("\x07");
          i++;
          break;
        case Ch.b:
          parts.push("\b");
          i++;
          break;
        case Ch.t:
          parts.push("\t");
          i++;
          break;
        case Ch.n:
          parts.push("\n");
          i++;
          break;
        case Ch.v:
          parts.push("\x0B");
          i++;
          break;
        case Ch.f:
          parts.push("\f");
          i++;
          break;
        case Ch.r:
          parts.push("\r");
          i++;
          break;
        case Ch.x: {
          // §2.1: \xHH — 4 characters total (\, x, H, H)
          if (i + 3 >= innerEnd) {
            throw new SawnError("Incomplete \\xHH escape sequence", lineNum);
          }
          const h1 = src.charCodeAt(i + 2);
          const h2 = src.charCodeAt(i + 3);
          if (!isHexDigit(h1) || !isHexDigit(h2)) {
            throw new SawnError(
              `Invalid hex escape: \\x${src[i + 2]}${src[i + 3]}`,
              lineNum,
            );
          }
          parts.push(String.fromCharCode(hexVal(h1) * 16 + hexVal(h2)));
          i += 3;
          break;
        }
        default:
          throw new SawnError(
            `Invalid escape sequence: \\${src[i + 1]}`,
            lineNum,
          );
      }
      segStart = i + 1;
    } else if (c === Ch.Quote) {
      throw new SawnError("Unescaped quote inside string", lineNum);
    } else if (c < 0x20) {
      // §2.1: reject literal control characters U+0000–U+001F
      throw new SawnError("Unescaped control character in string", lineNum);
    }
  }
  if (segStart < innerEnd) parts.push(src.slice(segStart, innerEnd));
  return parts.join("");
};

// Re-export stripComment from hacks.ts for backward compatibility (docs/parse_recursive.ts)
export { stripComment } from "./hacks.ts";
