/**
 * Saws (Serialized As Written Sheet) — parser and serializer.
 * Handles comma-delimited rows with Sawn's type rules.
 * Usable independently or as a sub-module of the Sawn parser.
 */

import { Ch } from "./constants.ts";
import { parseKey, parseValue } from "./decode.ts";
import { stripComment } from "./hacks.ts";
import { encodeKey, encodeValue } from "./encode.ts";
import { SawnError } from "./error.ts";
import type { ParseOptions, SawnObject } from "./types.ts";

// =========================================================================
// Parser
// =========================================================================

/** §5: Parse a standalone Saws document into an array of objects. */
export const parseSaws = (
  input: string,
  options: ParseOptions = {},
): SawnObject[] => {
  const src = input;
  const len = src.length;

  // §1.1: reject byte order mark (BOM, U+FEFF)
  if (len > 0 && src.charCodeAt(0) === 0xFEFF) {
    throw new SawnError(
      "Document must not begin with a byte order mark (BOM)",
      1,
    );
  }

  const lineStarts: number[] = [];
  const lineEnds: number[] = [];

  let lineNumCounter = 0;
  const lineNums: number[] = [];
  let ls = 0;
  // §1.1: <= len so the final line is processed even without a trailing LF
  while (ls <= len) {
    lineNumCounter++;
    let le = src.indexOf("\n", ls);
    if (le === -1) le = len;

    let rawEnd = le;
    if (rawEnd > ls && src.charCodeAt(rawEnd - 1) === Ch.CR) rawEnd--;
    while (rawEnd > ls && src.charCodeAt(rawEnd - 1) <= Ch.Space) rawEnd--;

    // §5: leading whitespace is a parse error in Saws (no indentation)
    if (
      rawEnd > ls &&
      (src.charCodeAt(ls) === Ch.Space || src.charCodeAt(ls) === Ch.Tab)
    ) {
      // Check if the line is blank/whitespace-only — skip if so
      let k = ls;
      while (k < rawEnd && src.charCodeAt(k) <= Ch.Space) k++;
      if (k < rawEnd) {
        throw new SawnError(
          "Leading whitespace is not allowed in Saws",
          lineNumCounter,
        );
      }
    }

    // §1.2: skip comment-only lines
    if (
      rawEnd > ls &&
      src.charCodeAt(ls) === Ch.Slash &&
      ls + 1 < rawEnd && src.charCodeAt(ls + 1) === Ch.Slash
    ) {
      ls = le + 1;
      continue;
    }

    // §1.5: skip blank lines
    let start = ls;
    while (start < rawEnd && src.charCodeAt(start) <= Ch.Space) start++;

    if (start < rawEnd) {
      // §1.2: strip inline comments (must be preceded by space)
      const contentEnd = stripComment(src, start, rawEnd, lineNumCounter);
      if (contentEnd > start) {
        lineStarts.push(start);
        lineEnds.push(contentEnd);
        lineNums.push(lineNumCounter);
      }
    }

    ls = le + 1;
  }

  // §5: a Saws document must contain a header row
  if (lineStarts.length === 0) throw new SawnError("Empty saws input", 1);

  const columns = parseTableHeader(
    src,
    lineStarts[0],
    lineEnds[0],
    lineNums[0],
  );
  const rows: SawnObject[] = [];
  for (let i = 1; i < lineStarts.length; i++) {
    rows.push(
      parseTableRow(
        src,
        lineStarts[i],
        lineEnds[i],
        lineNums[i],
        columns,
        options,
      ),
    );
  }
  return rows;
};

// =========================================================================
// Shared helpers
// =========================================================================

/** §1.3: Scan past a quoted token, returning position after the closing quote. */
const scanQuotedToken = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
  context: string,
): number => {
  let j = start + 1; // skip opening quote
  while (j < end) {
    const c = src.charCodeAt(j);
    if (c === Ch.Backslash && j + 1 < end) {
      j += 2;
      continue;
    }
    if (c === Ch.Quote) return j + 1; // position after closing quote
    j++;
  }
  throw new SawnError(`Unterminated string in ${context}`, lineNum);
};

// =========================================================================
// Header parsing
// =========================================================================

/** §3.5: Parse comma-separated column header into key names. */
export const parseTableHeader = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
): string[] => {
  const columns: string[] = [];
  let i = start;

  while (i < end) {
    let tokenStart: number;
    let tokenEnd: number;

    if (src.charCodeAt(i) === Ch.Quote) {
      tokenStart = i;
      tokenEnd = scanQuotedToken(src, i, end, lineNum, "table header");
      i = tokenEnd;
    } else {
      tokenStart = i;
      let j = i;
      while (j < end && src.charCodeAt(j) !== Ch.Comma) j++;
      if (j === i) {
        throw new SawnError("Empty column name in table header", lineNum);
      }
      tokenEnd = j;
      i = j;
    }

    const colName = parseKey(src, tokenStart, tokenEnd, lineNum);
    // Prototype pollution prevention (implementation-level, not in spec)
    if (colName === "__proto__") {
      throw new SawnError(
        'Column name "__proto__" is not allowed',
        lineNum,
      );
    }
    // §3.5: duplicate column names are a parse error
    if (columns.includes(colName)) {
      throw new SawnError(
        `Duplicate column name "${colName}" in table header`,
        lineNum,
      );
    }
    columns.push(colName);

    if (i < end) {
      if (src.charCodeAt(i) !== Ch.Comma) {
        throw new SawnError("Expected comma in table header", lineNum);
      }
      i++;
      if (i >= end) {
        throw new SawnError("Trailing comma in table header", lineNum);
      }
    }
  }

  return columns;
};

// =========================================================================
// Row parsing
// =========================================================================

/** §3.5: Tokenize and parse a table row directly into a SawnObject. */
export const parseTableRow = (
  src: string,
  start: number,
  end: number,
  lineNum: number,
  columns: string[],
  options: ParseOptions,
): SawnObject => {
  const row: SawnObject = {};
  let i = start;
  let col = 0;
  const numCols = columns.length;

  while (i < end) {
    if (col >= numCols) {
      throw new SawnError(
        `Table row has more values than header has ${numCols} columns`,
        lineNum,
      );
    }

    let tokenStart: number;
    let tokenEnd: number;

    if (src.charCodeAt(i) === Ch.Quote) {
      tokenStart = i;
      tokenEnd = scanQuotedToken(src, i, end, lineNum, "table");
      i = tokenEnd;
    } else {
      tokenStart = i;
      let j = i;
      while (j < end && src.charCodeAt(j) !== Ch.Comma) j++;
      // §3.5: empty cells (consecutive commas) are a parse error
      if (j === i) {
        throw new SawnError("Empty cell is not allowed in table", lineNum);
      }
      tokenEnd = j;
      i = j;
    }

    row[columns[col]] = parseValue(src, tokenStart, tokenEnd, lineNum, options);
    col++;

    if (i < end) {
      if (src.charCodeAt(i) !== Ch.Comma) {
        throw new SawnError("Expected comma separator in table", lineNum);
      }
      i++;
      // §3.5: trailing comma is a parse error
      if (i >= end) {
        throw new SawnError("Trailing comma in table row", lineNum);
      }
    }
  }

  // §3.5: each data row must contain exactly as many values as there are columns
  if (col !== numCols) {
    throw new SawnError(
      `Table row has ${col} values but header has ${numCols} columns`,
      lineNum,
    );
  }

  return row;
};

// =========================================================================
// Serializer
// =========================================================================

/** §5: Stringify an array of homogeneous objects to Saws format. */
export const stringifySaws = (rows: SawnObject[]): string => {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);

  // §3.5: all elements MUST have identical key sets with identical ordering
  for (let r = 1; r < rows.length; r++) {
    const rowKeys = Object.keys(rows[r]);
    if (rowKeys.length !== columns.length) {
      throw new SawnError(
        `Table row ${
          r + 1
        } has ${rowKeys.length} keys but header has ${columns.length}`,
        0,
      );
    }
    for (let c = 0; c < columns.length; c++) {
      if (rowKeys[c] !== columns[c]) {
        throw new SawnError(
          `Table row ${r + 1} key "${rowKeys[c]}" does not match header key "${
            columns[c]
          }"`,
          0,
        );
      }
    }
  }

  // +2 for header + trailing newline sentinel
  const parts: string[] = new Array(rows.length + 2);

  // Header
  const headerParts: string[] = new Array(columns.length);
  for (let i = 0; i < columns.length; i++) {
    headerParts[i] = encodeKey(columns[i]);
  }
  parts[0] = headerParts.join(",");

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let rowStr = encodeValue(row[columns[0]]);
    for (let c = 1; c < columns.length; c++) {
      rowStr += "," + encodeValue(row[columns[c]]);
    }
    parts[r + 1] = rowStr;
  }

  // Sentinel empty string — join("\n") produces a trailing newline without extra allocation
  parts[rows.length + 1] = "";
  return parts.join("\n");
};
