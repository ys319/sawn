/**
 * @module sawn
 *
 * Sawn v1.0 (Serialized As Written Notation) parser and serializer.
 *
 * @example
 * ```ts
 * import { parse, stringify } from "@ys319/sawn";
 *
 * const data = parse(`
 * name="Luke Skywalker"
 * height=172
 * jedi=true
 * `);
 * // { name: "Luke Skywalker", height: 172, jedi: true }
 *
 * const sawn = stringify({ name: "Luke", height: 172 });
 * // name="Luke"\nheight=172\n
 * ```
 */

export { SawnError } from "./src/error.ts";
export { parse } from "./src/parse.ts";
export { parseSaws, stringifySaws } from "./src/saws.ts";
export { stringify } from "./src/stringify.ts";
export type {
  ParseOptions,
  SawnArray,
  SawnObject,
  SawnValue,
  StringifyOptions,
} from "./src/types.ts";
