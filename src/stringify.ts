/**
 * Sawn v1.0 Serializer — stack-based, iterative line construction.
 */

import { encodeKey, encodeNumber, encodeValue } from "./encode.ts";
import { SawnError } from "./error.ts";
import type {
  SawnArray,
  SawnObject,
  SawnValue,
  StringifyOptions,
} from "./types.ts";

// §1.4: 2-space indentation — pre-computed cache for depths 0-20
const INDENT_CACHE: string[] = [];
for (let i = 0; i <= 20; i++) INDENT_CACHE[i] = "  ".repeat(i);
const getIndent = (depth: number): string =>
  INDENT_CACHE[depth] ?? (INDENT_CACHE[depth] = "  ".repeat(depth));

// =========================================================================
// Stack frame types
// =========================================================================

const enum EmitKind {
  Object,
  ArrayChildren,
}

interface EmitObjectFrame {
  kind: EmitKind.Object;
  obj: SawnObject;
  keys: string[];
  index: number;
  depth: number;
}

interface EmitArrayChildrenFrame {
  kind: EmitKind.ArrayChildren;
  arr: SawnArray;
  index: number;
  depth: number;
}

type EmitFrame = EmitObjectFrame | EmitArrayChildrenFrame;

// =========================================================================
// Public API
// =========================================================================

/** Stringify a JavaScript value to Sawn v1.0 format. */
export const stringify = (
  value: SawnObject | SawnArray,
  options: StringifyOptions = {},
): string => {
  const lines: string[] = [];
  const stack: EmitFrame[] = [];

  if (Array.isArray(value)) {
    emitRootArray(value, lines, stack, options);
  } else {
    // §4: document must contain at least one root-level entry
    const keys = Object.keys(value);
    if (keys.length === 0) {
      throw new SawnError("Cannot stringify empty root object (no entries)", 0);
    }
    stack.push({
      kind: EmitKind.Object,
      obj: value,
      keys,
      index: 0,
      depth: 0,
    });
  }

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    switch (frame.kind) {
      case EmitKind.Object:
        processObjectFrame(frame, lines, stack, options);
        break;
      case EmitKind.ArrayChildren:
        processArrayChildrenFrame(frame, lines, stack, options);
        break;
    }
  }

  // Sentinel empty string — join("\n") produces a trailing newline without extra allocation
  lines.push("");
  return lines.join("\n");
};

// =========================================================================
// Root array
// =========================================================================

const emitRootArray = (
  arr: SawnArray,
  lines: string[],
  stack: EmitFrame[],
  options: StringifyOptions,
): void => {
  // §3.7: anonymous root array
  if (arr.length === 0) {
    lines.push("[]");
    return;
  }
  const threshold = options.tableThreshold ?? 1;
  // §3.5: try table emission for homogeneous object arrays
  if (tryEmitTable(arr, "[][] ", "  ", lines, threshold)) return;
  lines.push("[]");
  stack.push({ kind: EmitKind.ArrayChildren, arr, index: 0, depth: 1 });
};

// =========================================================================
// Object frame processing (1 key per call)
// =========================================================================

const processObjectFrame = (
  frame: EmitObjectFrame,
  lines: string[],
  stack: EmitFrame[],
  options: StringifyOptions,
): void => {
  if (frame.index >= frame.keys.length) {
    stack.pop();
    return;
  }

  const key = frame.keys[frame.index];
  const value = frame.obj[key];
  const depth = frame.depth;
  const indent = getIndent(depth);
  const ek = encodeKey(key);

  // Formatting: blank line between complex root entries for readability
  if (frame.index > 0 && depth === 0) {
    const prevValue = frame.obj[frame.keys[frame.index - 1]];
    if (isComplexValue(prevValue) || isComplexValue(value)) lines.push("");
  }

  frame.index++;

  // §3.4: array
  if (Array.isArray(value)) {
    const arr = value as SawnArray;
    if (arr.length === 0) {
      lines.push(indent + ek + "[]");
      return;
    }
    const threshold = options.tableThreshold ?? 1;
    if (
      tryEmitTable(
        arr,
        indent + ek + "[][] ",
        getIndent(depth + 1),
        lines,
        threshold,
      )
    ) return;
    lines.push(indent + ek + "[]");
    stack.push({
      kind: EmitKind.ArrayChildren,
      arr,
      index: 0,
      depth: depth + 1,
    });
    return;
  }

  // §3.3: object
  if (value !== null && typeof value === "object") {
    const obj = value as SawnObject;
    lines.push(indent + ek + "{}");
    const childKeys = Object.keys(obj);
    if (childKeys.length > 0) {
      stack.push({
        kind: EmitKind.Object,
        obj,
        keys: childKeys,
        index: 0,
        depth: depth + 1,
      });
    }
    return;
  }

  // §2.2: multi-line string
  if (
    typeof value === "string" && value.includes("\n") &&
    canUseMultiline(value)
  ) {
    // §3.1: key= followed by indented content lines
    lines.push(indent + ek + "=");
    const childIndent = getIndent(depth + 1);
    const parts = value.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") {
        // Empty content line → indentation-only line
        lines.push(childIndent);
      } else {
        lines.push(childIndent + parts[i]);
      }
    }
    return;
  }

  // §2.3, §2.6: number (including inf, -inf, nan, -0)
  if (typeof value === "number") {
    lines.push(indent + ek + "=" + encodeNumber(value));
    return;
  }

  // §2.1, §2.4, §2.5: string, boolean, null
  lines.push(indent + ek + "=" + encodeValue(value));
};

// =========================================================================
// Array children frame processing (1 element per call)
// =========================================================================

const processArrayChildrenFrame = (
  frame: EmitArrayChildrenFrame,
  lines: string[],
  stack: EmitFrame[],
  options: StringifyOptions,
): void => {
  if (frame.index >= frame.arr.length) {
    stack.pop();
    return;
  }

  const item = frame.arr[frame.index];
  const depth = frame.depth;
  const indent = getIndent(depth);

  frame.index++;

  // §3.6: anonymous object element
  if (item !== null && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as SawnObject;
    lines.push(indent + "{}");
    const childKeys = Object.keys(obj);
    if (childKeys.length > 0) {
      stack.push({
        kind: EmitKind.Object,
        obj,
        keys: childKeys,
        index: 0,
        depth: depth + 1,
      });
    }
    return;
  }

  // §3.7: anonymous nested array — try table emission first
  if (Array.isArray(item)) {
    const nestedArr = item as SawnArray;
    if (nestedArr.length === 0) {
      lines.push(indent + "[]");
      return;
    }
    const threshold = options.tableThreshold ?? 1;
    if (
      tryEmitTable(
        nestedArr,
        indent + "[][] ",
        getIndent(depth + 1),
        lines,
        threshold,
      )
    ) return;
    lines.push(indent + "[]");
    stack.push({
      kind: EmitKind.ArrayChildren,
      arr: nestedArr,
      index: 0,
      depth: depth + 1,
    });
    return;
  }

  // §3.4: scalar array element
  lines.push(indent + encodeValue(item));
};

// =========================================================================
// Table emission
// =========================================================================

/** §3.5: Try to emit an array of homogeneous objects as a table ([][]). */
const tryEmitTable = (
  arr: SawnArray,
  headerPrefix: string,
  rowIndent: string,
  lines: string[],
  threshold: number,
): boolean => {
  if (arr.length < threshold) return false;
  const first = arr[0];
  if (first === null || typeof first !== "object" || Array.isArray(first)) {
    return false;
  }
  const columns = Object.keys(first as SawnObject);
  if (columns.length === 0) return false;

  const encodedRows: string[] = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const obj = item as SawnObject;
    const itemKeys = Object.keys(obj);
    if (itemKeys.length !== columns.length) return false;

    let rowStr = rowIndent;
    for (let j = 0; j < columns.length; j++) {
      if (itemKeys[j] !== columns[j]) return false;
      const v = obj[columns[j]];
      if (v !== null && typeof v === "object") return false;
      if (j > 0) rowStr += ",";
      rowStr += encodeValue(v);
    }
    encodedRows[i] = rowStr;
  }

  const encodedCols: string[] = new Array(columns.length);
  for (let i = 0; i < columns.length; i++) {
    encodedCols[i] = encodeKey(columns[i]);
  }
  lines.push(headerPrefix + encodedCols.join(","));
  for (let i = 0; i < encodedRows.length; i++) {
    lines.push(encodedRows[i]);
  }
  return true;
};

// =========================================================================
// Utilities
// =========================================================================

/**
 * §2.2: Check if a string can be represented as a multi-line string.
 * Must contain \n, must not contain \r, tabs, or control chars.
 */
const canUseMultiline = (value: string): boolean => {
  // Must not contain \r or control chars
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x0d) return false; // \r
    if (c < 0x20 && c !== 0x0a) return false; // C0 control chars other than \n
    if (c >= 0x80 && c <= 0x9f) return false; // §2.1: C1 control chars need \xHH escaping
  }
  return true;
};

const isComplexValue = (v: SawnValue): boolean => {
  if (v === null) return false;
  return typeof v === "object";
};
