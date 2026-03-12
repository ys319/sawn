import { assertEquals, assertThrows } from "@std/assert";
import { parseSaws, stringifySaws } from "../../mod.ts";
import { SawnError } from "../../src/error.ts";

// =========================================================================
// parseSaws
// =========================================================================

Deno.test("parseSaws: basic table", () => {
  assertEquals(
    parseSaws('name,age\n"Alice",30\n"Bob",25\n'),
    [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }],
  );
});

Deno.test("parseSaws: single column", () => {
  assertEquals(
    parseSaws('name\n"Alice"\n"Bob"\n'),
    [{ name: "Alice" }, { name: "Bob" }],
  );
});

Deno.test("parseSaws: all value types", () => {
  const result = parseSaws('a,b,c,d\n"str",42,true,null\n');
  assertEquals(result, [{ a: "str", b: 42, c: true, d: null }]);
});

Deno.test("parseSaws: quoted column names", () => {
  assertEquals(
    parseSaws('"first name","last name"\n"Alice","Smith"\n'),
    [{ "first name": "Alice", "last name": "Smith" }],
  );
});

Deno.test("parseSaws: empty input throws", () => {
  assertThrows(() => parseSaws(""), SawnError);
});

Deno.test("parseSaws: column count mismatch throws", () => {
  assertThrows(() => parseSaws("a,b,c\n1,2\n"), SawnError);
});

Deno.test("parseSaws: empty cell throws", () => {
  assertThrows(() => parseSaws("a,b\n1,,3\n"), SawnError);
});

Deno.test("parseSaws: trailing comma throws", () => {
  assertThrows(() => parseSaws("a,b\n1,\n"), SawnError);
});

Deno.test("parseSaws: too many columns throws", () => {
  assertThrows(() => parseSaws("a,b\n1,2,3\n"), SawnError);
});

Deno.test("parseSaws: quoted reserved words as column names", () => {
  assertEquals(
    parseSaws('"true","null"\n1,2\n'),
    [{ true: 1, null: 2 }],
  );
});

Deno.test("parseSaws: bare reserved words as column names throws", () => {
  assertThrows(() => parseSaws("true,null\n1,2\n"), SawnError);
});

// =========================================================================
// stringifySaws
// =========================================================================

Deno.test("stringifySaws: basic table", () => {
  assertEquals(
    stringifySaws([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]),
    'name,age\n"Alice",30\n"Bob",25\n',
  );
});

Deno.test("stringifySaws: empty array", () => {
  assertEquals(stringifySaws([]), "");
});

Deno.test("stringifySaws: single row", () => {
  assertEquals(
    stringifySaws([{ x: 1, y: true }]),
    "x,y\n1,true\n",
  );
});

Deno.test("stringifySaws: quoted column names when needed", () => {
  assertEquals(
    stringifySaws([{ "first name": "Alice" }]),
    '"first name"\n"Alice"\n',
  );
});

Deno.test("stringifySaws: special values", () => {
  assertEquals(
    stringifySaws([{ a: null, b: Infinity }]),
    "a,b\nnull,inf\n",
  );
});

Deno.test("stringifySaws: mismatched key sets throw", () => {
  // §3.5: all elements MUST have identical key sets
  assertThrows(
    () => stringifySaws([{ a: 1, b: 2 }, { a: 3, c: 4 }]),
    SawnError,
  );
});

Deno.test("stringifySaws: mismatched key count throws", () => {
  assertThrows(
    () => stringifySaws([{ a: 1, b: 2 }, { a: 3 }]),
    SawnError,
  );
});

Deno.test("parseSaws: __proto__ column name is rejected", () => {
  assertThrows(
    () => parseSaws("__proto__,b\n1,2\n"),
    SawnError,
    "__proto__",
  );
});
