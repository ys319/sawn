import { assertEquals } from "@std/assert";
import type { SawnObject, SawnValue } from "../../mod.ts";
import { stringify } from "../../mod.ts";

// =========================================================================
// Object declarations (key{})
// =========================================================================

Deno.test("stringify: object uses key{}", () => {
  const result = stringify({ config: { host: "localhost", port: 8080 } });
  assertEquals(result, 'config{}\n  host="localhost"\n  port=8080\n');
});

Deno.test("stringify: empty object uses key{}", () => {
  assertEquals(stringify({ empty: {} }), "empty{}\n");
});

Deno.test("stringify: nested objects all use key{}", () => {
  assertEquals(
    stringify({ a: { b: { c: 1 } } }),
    "a{}\n  b{}\n    c=1\n",
  );
});

// =========================================================================
// Array declarations (key[])
// =========================================================================

Deno.test("stringify: empty array uses key[]", () => {
  assertEquals(stringify({ tags: [] as SawnValue[] }), "tags[]\n");
});

Deno.test("stringify: non-empty scalar array", () => {
  assertEquals(
    stringify({ tags: ["a", "b"] }),
    'tags[]\n  "a"\n  "b"\n',
  );
});

// =========================================================================
// Object elements use {} (not -)
// =========================================================================

Deno.test("stringify: heterogeneous array uses {} for objects", () => {
  const result = stringify({
    items: [
      { name: "Sword", damage: 50 },
      { name: "Potion" },
    ],
  });
  assertEquals(
    result,
    'items[]\n  {}\n    name="Sword"\n    damage=50\n  {}\n    name="Potion"\n',
  );
});

Deno.test("stringify: empty object in array uses {}", () => {
  const result = stringify({ arr: [{}, { x: 1 }] });
  assertEquals(result, "arr[]\n  {}\n  {}\n    x=1\n");
});

Deno.test("stringify: mixed primitives and objects in array", () => {
  const result = stringify({ arr: [1, { x: 2 }, 3] });
  assertEquals(result, "arr[]\n  1\n  {}\n    x=2\n  3\n");
});

// =========================================================================
// Tables (key[][])
// =========================================================================

Deno.test("stringify: homogeneous object array becomes table", () => {
  const result = stringify({
    users: [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ],
  });
  assertEquals(
    result,
    'users[][] name,age\n  "Alice",30\n  "Bob",25\n',
  );
});

Deno.test("stringify: table threshold respected", () => {
  const data = { users: [{ name: "Alice", age: 30 }] };
  // threshold=1: single-item should still be a table
  const asTable = stringify(data, { tableThreshold: 1 });
  assertEquals(asTable.includes("[][]"), true);
  // threshold=2: single-item should use {} notation
  const asList = stringify(data, { tableThreshold: 2 });
  assertEquals(asList.includes("[][]"), false);
});

// =========================================================================
// Root-level arrays
// =========================================================================

Deno.test("stringify: root array of scalars", () => {
  assertEquals(stringify([1, 2, 3]), "[]\n  1\n  2\n  3\n");
});

Deno.test("stringify: root empty array", () => {
  assertEquals(stringify([] as SawnValue[]), "[]\n");
});

Deno.test("stringify: root array of objects becomes table", () => {
  const result = stringify([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]);
  assertEquals(result, '[][] name,age\n  "Alice",30\n  "Bob",25\n');
});

// =========================================================================
// Multi-line strings
// =========================================================================

Deno.test("stringify: multi-line string uses key= + indent", () => {
  const result = stringify({ desc: "Line one\nLine two" });
  assertEquals(result, "desc=\n  Line one\n  Line two\n");
});

Deno.test("stringify: string with double newline uses indentation-only line", () => {
  const result = stringify({ desc: "a\n\nb" });
  assertEquals(result, "desc=\n  a\n  \n  b\n");
});

Deno.test("stringify: trailing newline uses indentation-only line", () => {
  const result = stringify({ desc: "a\nb\n" });
  assertEquals(result, "desc=\n  a\n  b\n  \n");
});

// =========================================================================
// Scalar values
// =========================================================================

Deno.test("stringify: all scalar types", () => {
  const result = stringify({
    s: "hello",
    n: 42,
    f: 3.14,
    t: true,
    b: false,
    nl: null,
    posInf: Infinity,
    negInf: -Infinity,
    notNum: NaN,
  });
  assertEquals(
    result,
    [
      's="hello"',
      "n=42",
      "f=3.14",
      "t=true",
      "b=false",
      "nl=null",
      "posInf=inf",
      "negInf=-inf",
      "notNum=nan",
      "",
    ].join("\n"),
  );
});

// =========================================================================
// Nested arrays
// =========================================================================

Deno.test("stringify: nested arrays use anonymous []", () => {
  const result = stringify({ matrix: [[1, 2], [3, 4]] });
  assertEquals(
    result,
    "matrix[]\n  []\n    1\n    2\n  []\n    3\n    4\n",
  );
});

Deno.test("stringify: nested empty array", () => {
  const result = stringify({ arr: [[] as SawnValue[]] });
  assertEquals(result, "arr[]\n  []\n");
});

Deno.test("stringify: nested array of objects uses anonymous [][] table", () => {
  // §3.7: anonymous [][] within [] should use table syntax for homogeneous objects
  const data = {
    datasets: [
      [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }],
      [{ name: "Charlie", age: 20 }],
    ],
  };
  const result = stringify(data);
  assertEquals(
    result,
    [
      "datasets[]",
      "  [][] name,age",
      '    "Alice",30',
      '    "Bob",25',
      "  [][] name,age",
      '    "Charlie",20',
      "",
    ].join("\n"),
  );
});

// =========================================================================
// Key encoding
// =========================================================================

Deno.test("stringify: non-IDENT keys are quoted", () => {
  const result = stringify({ "hello world": 1, "a=b": 2 });
  assertEquals(result, '"hello world"=1\n"a=b"=2\n');
});

// =========================================================================
// Blank line separators between complex root entries
// =========================================================================

Deno.test("stringify: blank lines between complex root entries", () => {
  const result = stringify({
    a: 1,
    config: { host: "x" },
    b: 2,
  });
  assertEquals(result, 'a=1\n\nconfig{}\n  host="x"\n\nb=2\n');
});

// =========================================================================
// Table key order rejection
// =========================================================================

Deno.test("stringify: different key order prevents table", () => {
  // §3.5: key ordering must be identical — different order falls back to {}
  const data = {
    items: [
      { a: 1, b: 2 },
      { b: 3, a: 4 },
    ],
  };
  const result = stringify(data);
  assertEquals(result.includes("[][]"), false);
  assertEquals(result.includes("{}\n"), true);
});

Deno.test("stringify: different key set prevents table", () => {
  const data: Record<string, SawnValue> = {
    items: [
      { a: 1, b: 2 } as Record<string, SawnValue>,
      { a: 3, c: 4 } as Record<string, SawnValue>,
    ],
  };
  const result = stringify(data);
  assertEquals(result.includes("[][]"), false);
});

// =========================================================================
// Deep nesting (stack overflow prevention)
// =========================================================================

Deno.test("stringify: deeply nested object does not stack overflow", () => {
  let obj: SawnValue = { leaf: 1 };
  for (let i = 0; i < 1000; i++) {
    obj = { nested: obj };
  }
  const result = stringify(obj as SawnObject);
  assertEquals(typeof result, "string");
  assertEquals(result.includes("leaf=1"), true);
});
