/**
 * Benchmark: Sawn v1.0 parse and stringify
 * Run: deno bench --allow-read bench/bench.ts
 */

import { parse, stringify } from "../mod.ts";
import type { SawnObject, SawnValue } from "../mod.ts";

// ---------------------------------------------------------------------------
// Test fixtures — parse real test files
// ---------------------------------------------------------------------------
const VALID_DIR = new URL("../tests/sawn/fixtures/valid/", import.meta.url)
  .pathname;

const fixtures: { name: string; data: SawnObject; text: string }[] = [];
for (const entry of Deno.readDirSync(VALID_DIR)) {
  if (entry.name.endsWith(".sawn")) {
    const text = Deno.readTextFileSync(VALID_DIR + entry.name);
    try {
      const parsed = parse(text);
      if (!Array.isArray(parsed)) {
        fixtures.push({
          name: entry.name.replace(".sawn", ""),
          data: parsed,
          text,
        });
      }
    } catch {
      // skip invalid
    }
  }
}
fixtures.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Benchmarks: individual fixtures
// ---------------------------------------------------------------------------
for (const f of fixtures) {
  Deno.bench(`parse: ${f.name}`, () => {
    parse(f.text);
  });
  Deno.bench(`stringify: ${f.name}`, () => {
    stringify(f.data);
  });
}

// ---------------------------------------------------------------------------
// Benchmark: large synthetic data (key-value heavy)
// ---------------------------------------------------------------------------
const kvObj: SawnObject = {};
for (let i = 0; i < 10000; i++) {
  kvObj[`key_${i}`] = i;
}
const kvText = stringify(kvObj);

Deno.bench("parse: 10k key-value pairs", () => {
  parse(kvText);
});
Deno.bench("stringify: 10k key-value pairs", () => {
  stringify(kvObj);
});

// ---------------------------------------------------------------------------
// Benchmark: table-heavy data
// ---------------------------------------------------------------------------
const tableData: SawnObject = {
  users: Array.from({ length: 5000 }, (_, i) => ({
    name: `user_${i}`,
    age: 20 + (i % 50),
    active: i % 2 === 0,
  })),
};
const tableText = stringify(tableData);

Deno.bench("parse: 5k-row table", () => {
  parse(tableText);
});
Deno.bench("stringify: 5k-row table", () => {
  stringify(tableData);
});

// ---------------------------------------------------------------------------
// Benchmark: nested objects
// ---------------------------------------------------------------------------
const nestedObj: SawnObject = {};
for (let i = 0; i < 2000; i++) {
  nestedObj[`item_${i}`] = {
    name: `item ${i}`,
    value: i * 1.5,
    active: true,
  };
}
const nestedText = stringify(nestedObj);

Deno.bench("parse: 2k nested objects", () => {
  parse(nestedText);
});
Deno.bench("stringify: 2k nested objects", () => {
  stringify(nestedObj);
});

// ---------------------------------------------------------------------------
// Benchmark: long string values
// ---------------------------------------------------------------------------
const longStr = "a".repeat(10000);
const longStrObj: SawnObject = {};
for (let i = 0; i < 500; i++) {
  longStrObj[`key_${i}`] = longStr;
}
const longStrText = stringify(longStrObj);

Deno.bench("parse: 500 x 10k-char strings", () => {
  parse(longStrText);
});
Deno.bench("stringify: 500 x 10k-char strings", () => {
  stringify(longStrObj);
});

// ---------------------------------------------------------------------------
// Benchmark: object elements in arrays ({} syntax)
// ---------------------------------------------------------------------------
const objElemData: SawnObject = {
  items: Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `item_${i}`,
    tags: ["a", "b", "c"] as SawnValue[],
    meta: { x: i, y: i * 2 },
  })),
};
const objElemText = stringify(objElemData);

Deno.bench("parse: 1k object elements with nested", () => {
  parse(objElemText);
});
Deno.bench("stringify: 1k object elements with nested", () => {
  stringify(objElemData);
});
