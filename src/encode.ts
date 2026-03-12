/**
 * Shared encoding functions for Sawn primitive values.
 */

import { Ch } from "./constants.ts";
import { isIdent, isReservedWord } from "./decode.ts";
import { SawnError } from "./error.ts";
import type { SawnValue } from "./types.ts";

// §2.1: single-pass detection — C0 control chars (0x00-0x1F), C1 control chars (0x80-0x9F),
// backslash, or double quote
// deno-lint-ignore no-control-regex
const NEEDS_ESCAPE_RE = /[\x00-\x1f\x80-\x9f\\"]/;

// §2.1: named escape map — prefer named escapes over \xHH where available
const NAMED_ESCAPES: Record<number, string> = {
  0x00: "\\0",
  0x07: "\\a",
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0b: "\\v",
  0x0c: "\\f",
  0x0d: "\\r",
};

/** §2.1: Encode a string value with double quotes and escape sequences. */
export const encodeString = (s: string): string => {
  if (!NEEDS_ESCAPE_RE.test(s)) return '"' + s + '"';

  const len = s.length;
  const parts: string[] = ['"'];
  let segStart = 0;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    let esc: string | undefined;
    if (c === Ch.Backslash) esc = "\\\\";
    else if (c === Ch.Quote) esc = '\\"';
    else if (c <= 0x1f) {
      // §2.1: named escape if available, otherwise \xHH with lowercase hex digits
      esc = NAMED_ESCAPES[c] ??
        ("\\x" + c.toString(16).padStart(2, "0"));
    } else if (c >= 0x80 && c <= 0x9f) {
      // §2.1: C1 control characters SHOULD be escaped as \xHH
      esc = "\\x" + c.toString(16).padStart(2, "0");
    }

    if (esc !== undefined) {
      if (segStart < i) parts.push(s.slice(segStart, i));
      parts.push(esc);
      segStart = i + 1;
    }
  }
  if (segStart < len) parts.push(s.slice(segStart));
  parts.push('"');
  return parts.join("");
};

/** §2.6: Encode a number, handling IEEE 754 special values. */
export const encodeNumber = (n: number): string => {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  // §2.3: preserve negative zero sign (String(-0) returns "0")
  if (n === 0 && 1 / n === -Infinity) return "-0";
  return String(n);
};

/** §1.7, §3.2: Encode a key — bare if valid IDENT and not a reserved word, otherwise quoted. */
export const encodeKey = (key: string): string => {
  // §3.2: empty quoted string MUST NOT be used as a key
  if (key.length === 0) {
    throw new SawnError('Empty string "" cannot be used as a key', 0);
  }
  return (isIdent(key, 0, key.length) && !isReservedWord(key))
    ? key
    : encodeString(key);
};

/** §2: Encode a scalar value for inline use (key=value, table cell). */
export const encodeValue = (value: SawnValue): string => {
  // Implementation guard: treat undefined as null (not in spec, but JS objects may have undefined values)
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return encodeNumber(value);
  if (typeof value === "string") return encodeString(value);
  throw new Error("Cannot encode complex value inline");
};
