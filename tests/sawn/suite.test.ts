import { assert } from "@std/assert";
import { parse } from "../../mod.ts";
import { deepEqual, replaceSentinels } from "../suite_utils.ts";

const VALID_DIR = new URL("./fixtures/valid/", import.meta.url).pathname;
const INVALID_DIR = new URL("./fixtures/invalid/", import.meta.url).pathname;

// Valid tests
const validFiles = Array.from(Deno.readDirSync(VALID_DIR))
  .map((e) => e.name)
  .filter((f) => f.endsWith(".sawn"))
  .sort();

for (const sawnFile of validFiles) {
  const jsonFile = sawnFile.replace(".sawn", ".expected.json");
  const jsonPath = VALID_DIR + jsonFile;
  try {
    Deno.statSync(jsonPath);
  } catch {
    continue;
  }

  const testName = sawnFile.replace(".sawn", "");
  Deno.test(`suite: ${testName}`, () => {
    const sawnText = Deno.readTextFileSync(VALID_DIR + sawnFile);
    const expectedRaw = JSON.parse(Deno.readTextFileSync(jsonPath));
    const expected = replaceSentinels(expectedRaw);
    const actual = parse(sawnText);
    assert(
      deepEqual(actual, expected),
      `Mismatch for ${testName}:\nExpected: ${
        JSON.stringify(expected, null, 2)
      }\nActual: ${JSON.stringify(actual, null, 2)}`,
    );
  });
}

// Invalid tests
const invalidFiles = Array.from(Deno.readDirSync(INVALID_DIR))
  .map((e) => e.name)
  .filter((f) => f.endsWith(".sawn"))
  .sort();

for (const sawnFile of invalidFiles) {
  const testName = sawnFile.replace(".sawn", "");
  Deno.test(`suite invalid: ${testName}`, () => {
    const sawnText = Deno.readTextFileSync(INVALID_DIR + sawnFile);
    let threw = false;
    try {
      parse(sawnText);
    } catch {
      threw = true;
    }
    assert(threw, `Expected parse error for ${testName} but got none`);
  });
}
