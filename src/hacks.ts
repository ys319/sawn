/**
 * Performance hacks — optimized implementations that trade readability for speed.
 *
 * Like Rust's `unsafe`, these functions are correct but use non-obvious techniques:
 * - SIMD-friendly patterns (regex, indexOf, includes for V8 vectorization)
 * - Manual integer arithmetic (avoid Number() + string allocation)
 * - Backslash counting (avoid per-char state machine)
 *
 * Each export documents the "clean equivalent" it replaces, so reviewers can
 * understand the semantic contract without decoding the optimization.
 */

import { Ch } from "./constants.ts";
import { SawnError } from "./error.ts";

// ---------------------------------------------------------------------------
// tryStringFastPath — SIMD hybrid for quoted string validation
// ---------------------------------------------------------------------------

/** §2.1: SIMD-accelerated regex for detecting special chars in quoted strings.
 * Matches C0 control chars (U+0000–U+001F), backslash, and double quote.
 * V8 compiles simple character class regexes to SIMD-accelerated scanners. */
// deno-lint-ignore no-control-regex
const QUOTED_SPECIAL_RE = /[\x00-\x1f\\"]/;

/**
 * §2.1: Fast path for quoted string validation (SIMD hybrid).
 *
 * Returns the decoded string if no escape sequences are present,
 * or null to signal that the slow path (escape processing) is required.
 *
 * Long strings (>64 chars) use V8's SIMD-accelerated regex and includes;
 * short strings use charCodeAt to avoid slice allocation overhead.
 *
 * Clean equivalent:
 * ```ts
 * const inner = src.slice(innerStart, innerEnd);
 * if (!inner.includes("\\")) { validate(inner); return inner; }
 * ```
 */
export const tryStringFastPath = (
  src: string,
  innerStart: number,
  innerEnd: number,
  lineNum: number,
): string | null => {
  const innerLen = innerEnd - innerStart;

  if (innerLen > 64) {
    // §2.1: slice for SIMD-friendly validation — also serves as the return value
    const inner = src.slice(innerStart, innerEnd);
    if (!QUOTED_SPECIAL_RE.test(inner)) return inner;
    // Has special chars — determine kind
    if (!inner.includes("\\")) {
      // No backslash: must be an error (control char or unescaped quote)
      if (inner.includes('"')) {
        throw new SawnError("Unescaped quote inside string", lineNum);
      }
      throw new SawnError("Unescaped control character in string", lineNum);
    }
    return null; // has backslash → slow path
  }

  // Short strings: charCodeAt avoids allocation overhead
  for (let k = innerStart; k < innerEnd; k++) {
    const c = src.charCodeAt(k);
    if (c === Ch.Backslash) return null; // has escape → slow path
    if (c === Ch.Quote) {
      throw new SawnError("Unescaped quote inside string", lineNum);
    }
    // §2.1: reject literal control characters U+0000–U+001F
    if (c < 0x20) {
      throw new SawnError("Unescaped control character in string", lineNum);
    }
  }
  return src.slice(innerStart, innerEnd);
};

// ---------------------------------------------------------------------------
// parseIntDirect — charCodeAt integer arithmetic
// ---------------------------------------------------------------------------

/**
 * §2.3: Parse integer directly via charCodeAt arithmetic.
 * Avoids Number(src.slice()) string allocation for common integer values.
 *
 * Caller must guarantee src[start..end) is a valid integer token
 * (optional minus + decimal digits, no fractional or exponent part).
 *
 * Clean equivalent: `Number(src.slice(start, end))`
 */
export const parseIntDirect = (
  src: string,
  start: number,
  end: number,
): number => {
  let i = start;
  const neg = src.charCodeAt(i) === Ch.Dash;
  if (neg) i++;
  let val = 0;
  while (i < end) {
    val = val * 10 + (src.charCodeAt(i) - Ch.Zero);
    i++;
  }
  return neg ? -val : val;
};

// ---------------------------------------------------------------------------
// stripComment — indexOf-based quote skipping
// ---------------------------------------------------------------------------

/**
 * §1.2: Strip comment '//' outside quoted strings.
 * §1.3: String priority rule — // inside strings is not a comment.
 * Inline comments must be preceded by at least one space.
 *
 * Uses indexOf for SIMD-accelerated scanning to skip over quoted string
 * content, with backslash counting to detect escaped quotes.
 *
 * Clean equivalent: char-by-char loop tracking inString/escape state flags.
 */
export const stripComment = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
): number => {
  let i = start;
  while (i < end) {
    const c = src.charCodeAt(i);
    if (c === Ch.Quote) {
      // §1.3: skip over quoted string using indexOf for SIMD-accelerated search
      i++; // skip opening quote
      while (i < end) {
        const qi = src.indexOf('"', i);
        if (qi === -1 || qi >= end) {
          // No closing quote within line — unterminated string; let parser handle error
          return end;
        }
        // Check if quote is escaped (preceded by odd number of backslashes)
        let bs = 0;
        let j = qi - 1;
        while (j >= start && src.charCodeAt(j) === Ch.Backslash) {
          bs++;
          j--;
        }
        i = qi + 1;
        if ((bs & 1) === 0) break; // not escaped → closing quote found
      }
      continue;
    }
    if (
      c === Ch.Slash && i + 1 < end &&
      src.charCodeAt(i + 1) === Ch.Slash
    ) {
      // §1.2: inline comment "//" found outside quotes
      if (i > start && src.charCodeAt(i - 1) !== Ch.Space) {
        throw new SawnError(
          "Inline comment must be preceded by a space",
          lineNum,
        );
      }
      let newEnd = i;
      while (newEnd > start && src.charCodeAt(newEnd - 1) <= Ch.Space) newEnd--;
      return newEnd;
    }
    i++;
  }
  return end;
};
