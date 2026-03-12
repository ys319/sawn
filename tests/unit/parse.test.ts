import { assertEquals, assertThrows } from "@std/assert";
import { parse } from "../../mod.ts";
import { SawnError } from "../../src/error.ts";

// =========================================================================
// Object declarations (key{})
// =========================================================================

Deno.test("parse: key{} with children", () => {
  assertEquals(parse('config{}\n  host="localhost"\n  port=8080\n'), {
    config: { host: "localhost", port: 8080 },
  });
});

Deno.test("parse: key{} empty (no children)", () => {
  assertEquals(parse("empty{}\n"), { empty: {} });
});

Deno.test("parse: nested key{}", () => {
  assertEquals(parse("a{}\n  b{}\n    c=1\n"), { a: { b: { c: 1 } } });
});

Deno.test("parse: bare key is parse error", () => {
  assertThrows(() => parse('config\n  host="localhost"\n'), SawnError);
});

Deno.test("parse: bare key with no children is error", () => {
  assertThrows(() => parse("metadata\n"), SawnError);
});

// =========================================================================
// Array declarations (key[])
// =========================================================================

Deno.test("parse: key[] with children", () => {
  assertEquals(parse('tags[]\n  "a"\n  "b"\n'), { tags: ["a", "b"] });
});

Deno.test("parse: key[] empty (no children)", () => {
  assertEquals(parse("empty[]\n"), { empty: [] });
});

Deno.test("parse: key=[] is parse error", () => {
  assertThrows(() => parse("data=[]\n"), SawnError);
});

Deno.test("parse: key={} is parse error", () => {
  assertThrows(() => parse("data={}\n"), SawnError);
});

// =========================================================================
// Object elements in arrays ({})
// =========================================================================

Deno.test("parse: {} object elements in array", () => {
  assertEquals(
    parse(
      'items[]\n  {}\n    name="Sword"\n    damage=50\n  {}\n    name="Potion"\n',
    ),
    { items: [{ name: "Sword", damage: 50 }, { name: "Potion" }] },
  );
});

Deno.test("parse: {} empty object in array", () => {
  assertEquals(parse("items[]\n  {}\n  {}\n    x=1\n"), {
    items: [{}, { x: 1 }],
  });
});

Deno.test("parse: - marker is parse error", () => {
  assertThrows(
    () => parse('items[]\n  - name="Sword"\n    damage=50\n'),
    SawnError,
  );
});

Deno.test("parse: mixed primitives and {} in array", () => {
  assertEquals(parse("arr[]\n  1\n  {}\n    x=2\n  3\n"), {
    arr: [1, { x: 2 }, 3],
  });
});

// =========================================================================
// Tables (key[][])
// =========================================================================

Deno.test("parse: key[][] table", () => {
  assertEquals(
    parse('users[][] name,age\n  "Alice",30\n  "Bob",25\n'),
    { users: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }] },
  );
});

Deno.test("parse: key[][] empty (no rows)", () => {
  assertEquals(parse("data[][] a,b\n"), { data: [] });
});

Deno.test("parse: key[][] with no columns is parse error", () => {
  assertThrows(() => parse("data[][]\n"), SawnError);
});

Deno.test("parse: key[][] with no columns but with rows throws", () => {
  assertThrows(() => parse("data[][]\n  1\n"), SawnError);
});

// =========================================================================
// Anonymous root
// =========================================================================

Deno.test("parse: anonymous [] root", () => {
  assertEquals(parse("[]\n  1\n  2\n  3\n"), [1, 2, 3]);
});

Deno.test("parse: anonymous [] empty", () => {
  assertEquals(parse("[]\n"), []);
});

Deno.test("parse: anonymous [][] table", () => {
  assertEquals(
    parse('[][] name,age\n  "Alice",30\n'),
    [{ name: "Alice", age: 30 }],
  );
});

Deno.test("parse: anonymous [][] empty (no rows)", () => {
  assertEquals(parse("[][] a,b\n"), []);
});

Deno.test("parse: anonymous root with siblings throws", () => {
  assertThrows(() => parse('[]\n  1\nname="test"\n'), SawnError);
});

// =========================================================================
// Nested anonymous arrays/tables in arrays
// =========================================================================

Deno.test("parse: nested [] in array", () => {
  assertEquals(parse("matrix[]\n  []\n    1\n    2\n  []\n    3\n"), {
    matrix: [[1, 2], [3]],
  });
});

Deno.test("parse: nested [][] in array", () => {
  assertEquals(
    parse("datasets[]\n  [][] x,y\n    1,2\n"),
    { datasets: [[{ x: 1, y: 2 }]] },
  );
});

Deno.test("parse: nested empty [] in array", () => {
  assertEquals(parse("arr[]\n  []\n  []\n    1\n"), { arr: [[], [1]] });
});

// =========================================================================
// Multi-line strings
// =========================================================================

Deno.test("parse: multi-line string", () => {
  assertEquals(parse("desc=\n  Line one\n  Line two\n"), {
    desc: "Line one\nLine two",
  });
});

Deno.test("parse: key= with no continuation throws", () => {
  assertThrows(() => parse('desc=\nnext="val"\n'), SawnError);
});

Deno.test("parse: multi-line with extra indent", () => {
  assertEquals(parse("desc=\n  Line one\n    Indented\n  Back\n"), {
    desc: "Line one\n  Indented\nBack",
  });
});

Deno.test("parse: multi-line with blank line termination", () => {
  assertEquals(parse("a=\n  line1\n\nb=2\n"), { a: "line1", b: 2 });
});

Deno.test("parse: multi-line with indentation-only empty line", () => {
  assertEquals(parse("a=\n  line1\n  \n  line3\n"), {
    a: "line1\n\nline3",
  });
});

Deno.test("parse: multi-line trailing newline via indentation-only line", () => {
  assertEquals(parse("a=\n  line1\n  \n"), { a: "line1\n" });
});

Deno.test("parse: multi-line string with odd leading spaces (content preserved)", () => {
  // §2.2: base indent is fixed at (key_depth+1)*2 = 2 spaces
  // 3 spaces total → strip 2 → 1 space content
  assertEquals(parse("code=\n   hello\n  world\n"), {
    code: " hello\nworld",
  });
});

Deno.test("parse: multi-line string with odd spaces in nested object", () => {
  // key at depth 1 (2 spaces), base indent = 4 spaces
  // 5 spaces → strip 4 → 1 space content
  assertEquals(parse("obj{}\n  text=\n     indented\n    normal\n"), {
    obj: { text: " indented\nnormal" },
  });
});

Deno.test("parse: multi-line string with more than one level deeper first line", () => {
  // §2.2: first line may have more leading spaces than base indent
  // base indent = 2, first line has 4 → strip 2 → "  first"
  assertEquals(parse("val=\n    first\n  second\n"), {
    val: "  first\nsecond",
  });
});

Deno.test("parse: multi-line string terminated by EOF", () => {
  // §2.2: content block ends at EOF if no dedent/blank line
  assertEquals(parse("val=\n  hello\n  world"), {
    val: "hello\nworld",
  });
});

Deno.test("parse: multi-line string trigger with inline comment", () => {
  // §2.2: key= // comment should still trigger multi-line string
  assertEquals(parse("val= // this is a comment\n  hello\n  world\n"), {
    val: "hello\nworld",
  });
});

Deno.test("parse: duplicate key detection across quoted and bare forms", () => {
  // §3.2: "name" and name are the same key
  assertThrows(
    () => parse('"name"="Alice"\nname="Bob"\n'),
    SawnError,
    'Duplicate key "name"',
  );
});

// =========================================================================
// Key-value pairs
// =========================================================================

Deno.test("parse: simple key=value", () => {
  assertEquals(parse('name="Luke"\nage=25\n'), { name: "Luke", age: 25 });
});

Deno.test("parse: quoted keys", () => {
  assertEquals(parse('"hello world"=1\n'), { "hello world": 1 });
});

Deno.test("parse: duplicate keys throw", () => {
  assertThrows(() => parse("a=1\na=2\n"), SawnError);
});

// =========================================================================
// Reserved word keys
// =========================================================================

Deno.test("parse: quoted reserved word key is OK", () => {
  assertEquals(parse('"true"=1\n'), { "true": 1 });
});

Deno.test("parse: bare reserved word key is parse error", () => {
  assertThrows(() => parse("true=1\n"), SawnError);
});

// =========================================================================
// Comments and blank lines
// =========================================================================

Deno.test("parse: comments are ignored", () => {
  assertEquals(parse('// comment\nname="test"  // inline\n'), { name: "test" });
});

Deno.test("parse: blank lines are ignored", () => {
  assertEquals(parse("\n\na=1\n\nb=2\n\n"), { a: 1, b: 2 });
});

Deno.test("parse: inline comment needs space before //", () => {
  assertEquals(parse("a=1 // comment\n"), { a: 1 });
});

// =========================================================================
// Indentation errors
// =========================================================================

Deno.test("parse: tab indentation throws", () => {
  assertThrows(() => parse('config{}\n\thost="x"\n'), SawnError);
});

Deno.test("parse: odd indentation throws", () => {
  assertThrows(() => parse('config{}\n   host="x"\n'), SawnError);
});

Deno.test("parse: indentation jump throws", () => {
  assertThrows(() => parse("a{}\n  b{}\n      c=1\n"), SawnError);
});

// =========================================================================
// Empty document is parse error
// =========================================================================

Deno.test("parse: empty document", () => {
  assertThrows(() => parse(""), SawnError);
  assertThrows(() => parse("\n"), SawnError);
  assertThrows(() => parse("// just a comment\n"), SawnError);
});

// =========================================================================
// §1.1: Encoding
// =========================================================================

Deno.test("parse: BOM (U+FEFF) at start is rejected", () => {
  assertThrows(() => parse("\uFEFFa=1\n"), SawnError, "byte order mark");
});

Deno.test("parse: CRLF is normalized to LF", () => {
  assertEquals(parse("a=1\r\nb=2\r\n"), { a: 1, b: 2 });
});

Deno.test("parse: CRLF in multi-line string", () => {
  assertEquals(parse("text=\r\n  line1\r\n  line2\r\n"), {
    text: "line1\nline2",
  });
});

// =========================================================================
// §1.2: Inline comment without preceding space is parse error
// =========================================================================

Deno.test("parse: value//comment (no space) is parse error", () => {
  assertThrows(() => parse("a=42//comment\n"), SawnError);
});

Deno.test("parse: string//comment (no space) is parse error", () => {
  assertThrows(() => parse('a="hello"//comment\n'), SawnError);
});

// =========================================================================
// Object elements with nested structures
// =========================================================================

Deno.test("parse: {} with nested key{}, key[], key[][]", () => {
  const input = `items[]
  {}
    name="Alpha"
    config{}
      port=8080
    tags[]
      "a"
      "b"
    scores[][] subject,grade
      "math",95
`;
  assertEquals(parse(input), {
    items: [{
      name: "Alpha",
      config: { port: 8080 },
      tags: ["a", "b"],
      scores: [{ subject: "math", grade: 95 }],
    }],
  });
});

// =========================================================================
// Prototype pollution prevention
// =========================================================================

Deno.test("parse: __proto__ key is rejected", () => {
  assertThrows(() => parse("__proto__=1\n"), SawnError, "__proto__");
});

Deno.test("parse: quoted __proto__ key is rejected", () => {
  assertThrows(() => parse('"__proto__"=1\n'), SawnError, "__proto__");
});

Deno.test("parse: __proto__ in nested object is rejected", () => {
  assertThrows(
    () => parse("obj{}\n  __proto__=1\n"),
    SawnError,
    "__proto__",
  );
});

Deno.test("parse: __proto__ as table column is rejected", () => {
  assertThrows(
    () => parse("items[][] __proto__,b\n  1,2\n"),
    SawnError,
    "__proto__",
  );
});

// =========================================================================
// Unterminated quoted key
// =========================================================================

Deno.test("parse: unterminated quoted key gives clear error", () => {
  assertThrows(
    () => parse('"unclosed=1\n'),
    SawnError,
    "Unterminated quoted key",
  );
});
