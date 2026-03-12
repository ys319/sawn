import { assert } from "@std/assert";
import { parseSaws } from "../../mod.ts";
import { deepEqual, replaceSentinels } from "../suite_utils.ts";

const VALID_DIR = new URL("./fixtures/valid/", import.meta.url).pathname;
const INVALID_DIR = new URL("./fixtures/invalid/", import.meta.url).pathname;

// Valid Saws tests
const validFiles = Array.from(Deno.readDirSync(VALID_DIR))
  .map((e) => e.name)
  .filter((f) => f.endsWith(".saws"))
  .sort();

for (const sawsFile of validFiles) {
  const jsonFile = sawsFile + ".expected.json";
  const jsonPath = VALID_DIR + jsonFile;
  try {
    Deno.statSync(jsonPath);
  } catch {
    continue;
  }

  const testName = sawsFile.replace(".saws", "");
  Deno.test(`saws suite: ${testName}`, () => {
    const sawsText = Deno.readTextFileSync(VALID_DIR + sawsFile);
    const expectedRaw = JSON.parse(Deno.readTextFileSync(jsonPath));
    const expected = replaceSentinels(expectedRaw);
    const actual = parseSaws(sawsText);
    assert(
      deepEqual(actual, expected),
      `Mismatch for ${testName}:\nExpected: ${
        JSON.stringify(expected, null, 2)
      }\nActual: ${JSON.stringify(actual, null, 2)}`,
    );
  });
}

// Invalid Saws tests
const invalidFiles = Array.from(Deno.readDirSync(INVALID_DIR))
  .map((e) => e.name)
  .filter((f) => f.endsWith(".saws"))
  .sort();

for (const sawsFile of invalidFiles) {
  const testName = sawsFile.replace(".saws", "");
  Deno.test(`saws suite invalid: ${testName}`, () => {
    const sawsText = Deno.readTextFileSync(INVALID_DIR + sawsFile);
    let threw = false;
    try {
      parseSaws(sawsText);
    } catch {
      threw = true;
    }
    assert(threw, `Expected parse error for ${testName} but got none`);
  });
}
