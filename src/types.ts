/** All possible Sawn value types. */
export type SawnValue =
  | string
  | number
  | boolean
  | null
  | SawnObject
  | SawnArray;

/** A Sawn object (string-keyed record). */
export type SawnObject = { [key: string]: SawnValue };

/** A Sawn array. */
export type SawnArray = SawnValue[];

/** Options for parsing (Sawn → JS). */
export interface ParseOptions {
  /** How to handle `inf`/`-inf`/`nan`. Default: "preserve" */
  readonly specialNumberHandling?: "preserve" | "null" | "string";
}

/** Options for serialization (JS → Sawn). */
export interface StringifyOptions {
  /** Minimum number of objects in an array to use table syntax. Default: 1 */
  readonly tableThreshold?: number;
}
