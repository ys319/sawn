import { assertEquals } from "@std/assert";
import { parse, stringify } from "../mod.ts";
import type { SawnObject, SawnValue } from "../mod.ts";

Deno.test("roundtrip: parse → stringify → parse", () => {
  const input = `films[][] episode,title,director
  4,"A New Hope","George Lucas"
  5,"The Empire Strikes Back","Irvin Kershner"
  6,"Return of the Jedi","Richard Marquand"
`;
  const parsed = parse(input);
  const stringified = stringify(parsed as SawnObject);
  const reparsed = parse(stringified);
  assertEquals(parsed, reparsed);
});

Deno.test("roundtrip: stringify → parse → stringify", () => {
  const data = {
    name: "Luke Skywalker",
    height: 172,
    jedi: true,
    homeworld: "tatooine",
    midichlorian: null,
  };
  const stringified = stringify(data);
  const parsed = parse(stringified);
  const restringified = stringify(parsed as SawnObject);
  assertEquals(stringified, restringified);
});

Deno.test("roundtrip: complex nested structure", () => {
  const data = {
    config: {
      server: { host: "localhost", port: 8080, ssl: true },
      database: { url: "postgres://localhost/mydb", pool: 10 },
    },
    users: [
      { name: "Alice", age: 30, active: true },
      { name: "Bob", age: 25, active: false },
    ],
    tags: ["javascript", "typescript"],
    metadata: {},
    empty: [] as SawnValue[],
  };
  const stringified = stringify(data);
  const parsed = parse(stringified);
  assertEquals(parsed, data);
});

Deno.test("roundtrip: empty structures", () => {
  const data = {
    emptyObj: {},
    emptyArr: [] as SawnValue[],
    nested: {
      inner: {} as Record<string, SawnValue>,
      list: [] as SawnValue[],
    },
  };
  const stringified = stringify(data);
  const parsed = parse(stringified);
  assertEquals(parsed, data);
});

Deno.test("roundtrip: object elements in arrays", () => {
  const data: Record<string, SawnValue> = {
    items: [
      { name: "Sword", damage: 50, effect: null },
      { name: null, damage: null, effect: null },
      { name: "Potion", damage: null, effect: "heal" },
    ],
  };
  const stringified = stringify(data);
  const parsed = parse(stringified);
  assertEquals(parsed, data);
});

Deno.test("roundtrip: C1 control characters", () => {
  // §2.1: C1 control chars (U+0080–U+009F) should survive roundtrip via \xHH escaping
  const data = { text: "hello\x80\x9Fworld" };
  const stringified = stringify(data);
  const parsed = parse(stringified);
  assertEquals(parsed, data);
});

Deno.test("roundtrip: nested array of objects uses table", () => {
  // §3.7: anonymous [][] within [] should roundtrip via table syntax
  const data: Record<string, SawnValue> = {
    datasets: [
      [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ],
      [{ name: "Charlie", age: 20 }],
    ],
  };
  const stringified = stringify(data);
  // Verify table syntax is used
  assertEquals(stringified.includes("[][] name,age"), true);
  const parsed = parse(stringified);
  assertEquals(parsed, data);
});

Deno.test("roundtrip: negative zero preserved", () => {
  // §2.3: implementations SHOULD preserve the sign of -0
  const data = { val: -0 };
  const stringified = stringify(data);
  const parsed = parse(stringified) as { val: number };
  assertEquals(Object.is(parsed.val, -0), true);
});
