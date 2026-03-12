import { assertEquals, assertThrows } from "@std/assert";
import {
  isIdent,
  parseKey,
  parseNumber,
  parseQuotedString,
  parseValue,
} from "../../src/decode.ts";
import { stripComment } from "../../src/hacks.ts";
import { SawnError } from "../../src/error.ts";

// =========================================================================
// isIdent
// =========================================================================

Deno.test("isIdent: valid bare identifiers", () => {
  const cases = [
    "x",
    "foo",
    "FooBar",
    "_private",
    "a1",
  ];
  for (const c of cases) {
    assertEquals(isIdent(c, 0, c.length), true, `expected "${c}" to be ident`);
  }
});

Deno.test("isIdent: invalid bare identifiers", () => {
  const cases = [
    "",
    "1abc",
    "-foo",
    ".bar",
    "a b",
    "a=b",
    '"quoted"',
    "build-date",
    "x.y",
    "a_b.c-d",
  ];
  for (const c of cases) {
    assertEquals(
      isIdent(c, 0, c.length),
      false,
      `expected "${c}" to NOT be ident`,
    );
  }
});

Deno.test("isIdent: with pointer offsets", () => {
  const src = "  foo  ";
  assertEquals(isIdent(src, 2, 5), true);
  assertEquals(isIdent(src, 0, 5), false); // starts with space
});

// =========================================================================
// parseKey
// =========================================================================

Deno.test("parseKey: bare key", () => {
  assertEquals(parseKey("foo", 0, 3, 1), "foo");
});

Deno.test("parseKey: bare key with hyphen throws", () => {
  assertThrows(() => parseKey("build-date", 0, 10, 1), SawnError);
});

Deno.test("parseKey: quoted key", () => {
  assertEquals(parseKey('"hello world"', 0, 13, 1), "hello world");
  assertEquals(parseKey('"a\\nb"', 0, 6, 1), "a\nb");
});

Deno.test("parseKey: reserved words as bare keys throw", () => {
  for (const word of ["true", "false", "null", "inf", "nan"]) {
    assertThrows(
      () => parseKey(word, 0, word.length, 1),
      SawnError,
      undefined,
      `expected bare key "${word}" to throw`,
    );
  }
});

Deno.test("parseKey: reserved words as quoted keys are valid", () => {
  assertEquals(parseKey('"true"', 0, 6, 1), "true");
  assertEquals(parseKey('"null"', 0, 6, 1), "null");
  assertEquals(parseKey('"false"', 0, 7, 1), "false");
  assertEquals(parseKey('"inf"', 0, 5, 1), "inf");
  assertEquals(parseKey('"nan"', 0, 5, 1), "nan");
});

Deno.test("parseKey: empty quoted string key throws", () => {
  assertThrows(() => parseKey('""', 0, 2, 1), SawnError);
});

Deno.test("parseKey: invalid bare key throws", () => {
  assertThrows(() => parseKey("1abc", 0, 4, 1), SawnError);
  assertThrows(() => parseKey("a b", 0, 3, 1), SawnError);
});

// =========================================================================
// parseValue
// =========================================================================

Deno.test("parseValue: strings", () => {
  assertEquals(parseValue('"hello"', 0, 7, 1), "hello");
  assertEquals(parseValue('""', 0, 2, 1), "");
  assertEquals(parseValue('"a\\tb"', 0, 6, 1), "a\tb");
});

Deno.test("parseValue: numbers", () => {
  assertEquals(parseValue("42", 0, 2, 1), 42);
  assertEquals(parseValue("-7", 0, 2, 1), -7);
  assertEquals(parseValue("3.14", 0, 4, 1), 3.14);
  assertEquals(parseValue("6.022e23", 0, 8, 1), 6.022e23);
  assertEquals(parseValue("0", 0, 1, 1), 0);
  assertEquals(parseValue("-0", 0, 2, 1), -0);
});

Deno.test("parseValue: booleans", () => {
  assertEquals(parseValue("true", 0, 4, 1), true);
  assertEquals(parseValue("false", 0, 5, 1), false);
});

Deno.test("parseValue: null", () => {
  assertEquals(parseValue("null", 0, 4, 1), null);
});

Deno.test("parseValue: undefined throws", () => {
  assertThrows(() => parseValue("undefined", 0, 9, 1), SawnError);
});

Deno.test("parseValue: IEEE 754 specials", () => {
  assertEquals(parseValue("inf", 0, 3, 1), Infinity);
  assertEquals(parseValue("-inf", 0, 4, 1), -Infinity);
  assertEquals(Number.isNaN(parseValue("nan", 0, 3, 1) as number), true);
});

Deno.test("parseValue: -nan throws", () => {
  assertThrows(() => parseValue("-nan", 0, 4, 1), SawnError);
});

Deno.test("parseValue: special number handling options", () => {
  assertEquals(
    parseValue("inf", 0, 3, 1, { specialNumberHandling: "null" }),
    null,
  );
  assertEquals(
    parseValue("inf", 0, 3, 1, { specialNumberHandling: "string" }),
    "Infinity",
  );
  assertEquals(
    parseValue("-inf", 0, 4, 1, { specialNumberHandling: "string" }),
    "-Infinity",
  );
  assertEquals(
    parseValue("nan", 0, 3, 1, { specialNumberHandling: "string" }),
    "NaN",
  );
});

Deno.test("parseValue: rejects [] and {} as values", () => {
  assertThrows(() => parseValue("[]", 0, 2, 1), SawnError);
  assertThrows(() => parseValue("{}", 0, 2, 1), SawnError);
});

Deno.test("parseValue: invalid bare tokens throw", () => {
  assertThrows(() => parseValue("abc", 0, 3, 1), SawnError);
  assertThrows(() => parseValue("TRUE", 0, 4, 1), SawnError);
  assertThrows(() => parseValue("Null", 0, 4, 1), SawnError);
  assertThrows(() => parseValue("", 0, 0, 1), SawnError);
});

// =========================================================================
// parseNumber
// =========================================================================

Deno.test("parseNumber: valid numbers", () => {
  assertEquals(parseNumber("0", 0, 1, 1), 0);
  assertEquals(parseNumber("123", 0, 3, 1), 123);
  assertEquals(parseNumber("-42", 0, 3, 1), -42);
  assertEquals(parseNumber("1.5", 0, 3, 1), 1.5);
  assertEquals(parseNumber("1e10", 0, 4, 1), 1e10);
  assertEquals(parseNumber("1.5e-3", 0, 6, 1), 1.5e-3);
  assertEquals(parseNumber("1E+2", 0, 4, 1), 1E+2);
});

Deno.test("parseNumber: invalid numbers throw", () => {
  assertThrows(() => parseNumber("08080", 0, 5, 1), SawnError); // leading zero
  assertThrows(() => parseNumber("+42", 0, 3, 1), SawnError); // positive sign
  assertThrows(() => parseNumber("1.", 0, 2, 1), SawnError); // trailing dot
  assertThrows(() => parseNumber(".5", 0, 2, 1), SawnError); // leading dot
  assertThrows(() => parseNumber("1e", 0, 2, 1), SawnError); // incomplete exponent
});

// =========================================================================
// parseQuotedString
// =========================================================================

Deno.test("parseQuotedString: simple strings", () => {
  assertEquals(parseQuotedString('"hello"', 0, 7, 1), "hello");
  assertEquals(parseQuotedString('""', 0, 2, 1), "");
});

Deno.test("parseQuotedString: escape sequences", () => {
  assertEquals(parseQuotedString('"a\\nb"', 0, 6, 1), "a\nb");
  assertEquals(parseQuotedString('"a\\tb"', 0, 6, 1), "a\tb");
  assertEquals(parseQuotedString('"a\\\\b"', 0, 6, 1), "a\\b");
  assertEquals(parseQuotedString('"a\\"b"', 0, 6, 1), 'a"b');
});

Deno.test("parseQuotedString: new escape sequences", () => {
  assertEquals(parseQuotedString('"a\\0b"', 0, 6, 1), "a\0b");
  assertEquals(parseQuotedString('"a\\ab"', 0, 6, 1), "a\x07b");
  assertEquals(parseQuotedString('"a\\bb"', 0, 6, 1), "a\bb");
  assertEquals(parseQuotedString('"a\\vb"', 0, 6, 1), "a\vb");
  assertEquals(parseQuotedString('"a\\fb"', 0, 6, 1), "a\fb");
});

Deno.test("parseQuotedString: hex escape \\xHH", () => {
  assertEquals(parseQuotedString('"a\\x01b"', 0, 8, 1), "a\x01b");
  assertEquals(parseQuotedString('"\\x1F"', 0, 6, 1), "\x1f");
});

Deno.test("parseQuotedString: invalid hex escape throws", () => {
  assertThrows(() => parseQuotedString('"\\xGG"', 0, 6, 1), SawnError);
});

Deno.test("parseQuotedString: unescaped quote inside throws", () => {
  assertThrows(() => parseQuotedString('"a"b"', 0, 5, 1), SawnError);
});

Deno.test("parseQuotedString: literal control characters throw (fast path)", () => {
  // No backslash → fast path; literal control chars must be rejected
  assertThrows(
    () => parseQuotedString('"a\x01b"', 0, 5, 1),
    SawnError,
    "control character",
  );
  assertThrows(
    () => parseQuotedString('"a\x09b"', 0, 5, 1),
    SawnError,
    "control character",
  );
  assertThrows(
    () => parseQuotedString('"a\x1Fb"', 0, 5, 1),
    SawnError,
    "control character",
  );
});

Deno.test("parseQuotedString: literal control characters throw (slow path)", () => {
  // Backslash present → slow path; literal control chars must still be rejected
  assertThrows(
    () => parseQuotedString('"a\\n\x01b"', 0, 7, 1),
    SawnError,
    "control character",
  );
  assertThrows(
    () => parseQuotedString('"\x09\\n"', 0, 5, 1),
    SawnError,
    "control character",
  );
});

Deno.test("parseQuotedString: escaped control characters are valid", () => {
  // Escaped forms must still work
  assertEquals(parseQuotedString('"\\t"', 0, 4, 1), "\t");
  assertEquals(parseQuotedString('"\\n"', 0, 4, 1), "\n");
  assertEquals(parseQuotedString('"\\x01"', 0, 6, 1), "\x01");
  assertEquals(parseQuotedString('"\\x1F"', 0, 6, 1), "\x1f");
  assertEquals(parseQuotedString('"\\0"', 0, 4, 1), "\0");
});

Deno.test("parseQuotedString: unterminated escape at EOF throws", () => {
  // §2.1: trailing backslash with no character after it
  assertThrows(
    () => parseQuotedString('"a\\"', 0, 4, 1),
    SawnError,
    "Unterminated escape",
  );
});

// =========================================================================
// stripComment
// =========================================================================

Deno.test("stripComment: no comment returns end unchanged", () => {
  const src = 'key="value"';
  assertEquals(stripComment(src, 0, src.length, 1), src.length);
});

Deno.test("stripComment: inline comment with space strips correctly", () => {
  const src = "key=42 // a comment";
  // §1.2: strips comment and trailing whitespace before //
  assertEquals(stripComment(src, 0, src.length, 1), 6);
});

Deno.test("stripComment: // inside quoted string is not a comment", () => {
  const src = 'key="a // b"';
  assertEquals(stripComment(src, 0, src.length, 1), src.length);
});

Deno.test("stripComment: // without preceding space throws", () => {
  // §1.2: inline comment must be preceded by at least one space
  const src = "key=42// comment";
  assertThrows(
    () => stripComment(src, 0, src.length, 1),
    SawnError,
    "preceded by a space",
  );
});

Deno.test("stripComment: // at start of content is standalone comment", () => {
  const src = "// full line comment";
  // At content start (i === start), no space required
  assertEquals(stripComment(src, 0, src.length, 1), 0);
});

Deno.test("stripComment: escaped quote inside string skips //", () => {
  const src = '"a\\"b" // comment';
  assertEquals(stripComment(src, 0, src.length, 1), 6);
});
