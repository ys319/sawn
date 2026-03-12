import { assertEquals, assertThrows } from "@std/assert";
import {
  encodeKey,
  encodeNumber,
  encodeString,
  encodeValue,
} from "../../src/encode.ts";
import { SawnError } from "../../src/error.ts";

// =========================================================================
// encodeString
// =========================================================================

Deno.test("encodeString: simple strings", () => {
  assertEquals(encodeString("hello"), '"hello"');
  assertEquals(encodeString(""), '""');
  assertEquals(encodeString("hello world"), '"hello world"');
});

Deno.test("encodeString: escape sequences", () => {
  assertEquals(encodeString('a"b'), '"a\\"b"');
  assertEquals(encodeString("a\\b"), '"a\\\\b"');
  assertEquals(encodeString("a\nb"), '"a\\nb"');
  assertEquals(encodeString("a\tb"), '"a\\tb"');
  assertEquals(encodeString("a\rb"), '"a\\rb"');
});

Deno.test("encodeString: mixed escapes", () => {
  assertEquals(
    encodeString('line1\nline2\t"quoted"'),
    '"line1\\nline2\\t\\"quoted\\""',
  );
});

Deno.test("encodeString: control char named escapes", () => {
  assertEquals(encodeString("\0"), '"\\0"');
  assertEquals(encodeString("\x07"), '"\\a"');
  assertEquals(encodeString("\b"), '"\\b"');
  assertEquals(encodeString("\x0B"), '"\\v"');
  assertEquals(encodeString("\f"), '"\\f"');
});

Deno.test("encodeString: hex escapes for unnamed control chars", () => {
  assertEquals(encodeString("\x01"), '"\\x01"');
  assertEquals(encodeString("\x1F"), '"\\x1f"');
});

Deno.test("encodeString: C1 control chars escaped as \\xHH", () => {
  // §2.1: C1 control characters (U+0080–U+009F) SHOULD be escaped
  assertEquals(encodeString("\x80"), '"\\x80"');
  assertEquals(encodeString("\x9F"), '"\\x9f"');
  assertEquals(encodeString("hello\x85world"), '"hello\\x85world"');
});

Deno.test("encodeString: long strings without escapes (fast path)", () => {
  const long = "a".repeat(10000);
  assertEquals(encodeString(long), '"' + long + '"');
});

// =========================================================================
// encodeNumber
// =========================================================================

Deno.test("encodeNumber: regular numbers", () => {
  assertEquals(encodeNumber(42), "42");
  assertEquals(encodeNumber(-7), "-7");
  assertEquals(encodeNumber(3.14), "3.14");
  assertEquals(encodeNumber(0), "0");
});

Deno.test("encodeNumber: special values", () => {
  assertEquals(encodeNumber(Infinity), "inf");
  assertEquals(encodeNumber(-Infinity), "-inf");
  assertEquals(encodeNumber(NaN), "nan");
});

Deno.test("encodeNumber: negative zero preserved", () => {
  // §2.3: implementations SHOULD preserve the sign of -0
  assertEquals(encodeNumber(-0), "-0");
  assertEquals(encodeNumber(0), "0");
});

// =========================================================================
// encodeKey
// =========================================================================

Deno.test("encodeKey: bare IDENT keys", () => {
  assertEquals(encodeKey("foo"), "foo");
  assertEquals(encodeKey("_private"), "_private");
});

Deno.test("encodeKey: dots and hyphens are quoted in v1.0", () => {
  assertEquals(encodeKey("build-date"), '"build-date"');
  assertEquals(encodeKey("x.y"), '"x.y"');
});

Deno.test("encodeKey: non-IDENT keys get quoted", () => {
  assertEquals(encodeKey("hello world"), '"hello world"');
  assertEquals(encodeKey("1abc"), '"1abc"');
  assertEquals(encodeKey("a=b"), '"a=b"');
});

Deno.test("encodeKey: empty string key throws", () => {
  // §3.2: empty quoted string MUST NOT be used as a key
  assertThrows(() => encodeKey(""), SawnError);
});

Deno.test("encodeKey: reserved words get quoted in v1.0", () => {
  assertEquals(encodeKey("true"), '"true"');
  assertEquals(encodeKey("null"), '"null"');
  assertEquals(encodeKey("inf"), '"inf"');
});

// =========================================================================
// encodeValue
// =========================================================================

Deno.test("encodeValue: all scalar types", () => {
  assertEquals(encodeValue("hello"), '"hello"');
  assertEquals(encodeValue(42), "42");
  assertEquals(encodeValue(true), "true");
  assertEquals(encodeValue(false), "false");
  assertEquals(encodeValue(null), "null");
  assertEquals(encodeValue(Infinity), "inf");
  assertEquals(encodeValue(-Infinity), "-inf");
  assertEquals(encodeValue(NaN), "nan");
});

Deno.test("encodeValue: undefined falls back to null", () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(encodeValue(undefined as any), "null");
});

Deno.test("encodeValue: complex values throw", () => {
  assertThrows(() => encodeValue({ a: 1 }));
  assertThrows(() => encodeValue([1, 2]));
});
