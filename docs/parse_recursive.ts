/**
 * Sawn v1.0 Parser — pointer-based, no regex.
 * All scanning uses charCodeAt. String slicing is deferred.
 *
 * NOTE: This is a legacy reference implementation. The current parser
 * is a stack-based streaming parser in src/parse.ts.
 */

import { Ch } from "../src/constants.ts";
import { parseKey, parseValue, stripComment } from "../src/decode.ts";
import { SawnError } from "../src/error.ts";
import { parseTableHeader, parseTableRow } from "../src/saws.ts";
import type { ParseOptions, SawnArray, SawnObject } from "../src/types.ts";

// =========================================================================
// Line representation
// =========================================================================

interface Line {
  readonly lineNum: number;
  readonly depth: number;
  readonly start: number;
  readonly end: number;
  /** true if the line has indentation but no content (indent-only line) */
  readonly indentOnly?: true;
}

// =========================================================================
// Public API
// =========================================================================

/** Parse a Sawn document string into a JavaScript object or array. */
export const parse = (
  input: string,
  options: ParseOptions = {},
): SawnObject | SawnArray => {
  const src = input;
  const { lines, lineOffsets, totalRawLines } = prepareLines(src);
  let pos = 0;
  let lastMultilineEndLine = 0;

  // §4: a document with no entries is a parse error
  const hasContent = lines.some((l) => !l.indentOnly);
  if (!hasContent) {
    throw new SawnError("Document contains no entries", 1);
  }

  // Skip leading indent-only lines
  while (pos < lines.length && lines[pos].indentOnly) pos++;

  const first = lines[pos];

  // §4: Anonymous root
  if (first.depth === 0) {
    const c0 = src.charCodeAt(first.start);
    const len = first.end - first.start;

    // §4: anonymous {} at root level is a parse error
    if (
      c0 === Ch.OpenBrace && len === 2 &&
      src.charCodeAt(first.start + 1) === Ch.CloseBrace
    ) {
      throw new SawnError(
        "Anonymous {} at root level is a parse error; the implicit root is already an object",
        first.lineNum,
      );
    }

    // §3.7: anonymous array: []
    if (
      c0 === Ch.OpenBracket && len >= 2 &&
      src.charCodeAt(first.start + 1) === Ch.CloseBracket
    ) {
      // Anonymous table: [][] col1,col2
      if (
        len >= 4 &&
        src.charCodeAt(first.start + 2) === Ch.OpenBracket &&
        src.charCodeAt(first.start + 3) === Ch.CloseBracket
      ) {
        return parseAnonTable(first, len);
      }

      // Anonymous array: []
      if (len === 2) {
        pos++;
        skipIndentOnly();
        if (pos >= lines.length || lines[pos].depth < 1) return [];
        const arr = parseArrayChildren(1);
        assertNoMore();
        return arr;
      }
    }
  }

  // Normal object root
  const result: SawnObject = {};
  parseChildren(0, result);
  if (pos < lines.length) {
    throw new SawnError("Unexpected content", lines[pos].lineNum);
  }
  return result;

  // =======================================================================
  // Anonymous table helper
  // =======================================================================

  function parseAnonTable(first: Line, len: number): SawnArray {
    if (len === 4) {
      // [][] with no columns — parse error
      throw new SawnError(
        "Table must have column names after [][]",
        first.lineNum,
      );
    }
    if (src.charCodeAt(first.start + 4) !== Ch.Space) {
      throw new SawnError("Expected space after [][]", first.lineNum);
    }
    const colStart = first.start + 5;
    const columns = parseTableHeader(src, colStart, first.end, first.lineNum);
    pos++;
    skipIndentOnly();
    const rows = parseTableRows(1, columns);
    if (rows.length === 0) return [];
    assertNoMore();
    return rows;
  }

  // =======================================================================
  // Object children: key=value, key{}, key[], key[][]
  // =======================================================================

  function parseChildren(depth: number, target: SawnObject): void {
    while (pos < lines.length) {
      if (lines[pos].indentOnly) {
        pos++;
        continue;
      }
      if (lines[pos].depth !== depth) break;
      const line = lines[pos];
      const { start, end, lineNum } = line;

      // --- §3.1: key=value ---
      const eqIdx = findEquals(src, start, end);
      if (eqIdx !== -1) {
        const key = parseKey(src, start, eqIdx, lineNum);
        checkDup(target, key, lineNum);
        const valStart = eqIdx + 1;

        // key= (multiline string §2.2)
        if (valStart === end) {
          pos++;
          target[key] = collectMultilineString(
            depth,
            lineNum,
            lineOffsets,
            totalRawLines,
            src,
          );
          // Advance pos past consumed content lines
          syncPosAfterMultiline();
          continue;
        }

        target[key] = parseValue(src, valStart, end, lineNum, options);
        pos++;
        continue;
      }

      // --- No '='. Scan past key to check for {}, [], [][] ---
      const keyEnd = scanKeyEnd(src, start, end);

      // §3.3: key{} — object declaration
      if (
        keyEnd + 2 <= end &&
        src.charCodeAt(keyEnd) === Ch.OpenBrace &&
        src.charCodeAt(keyEnd + 1) === Ch.CloseBrace &&
        keyEnd + 2 === end
      ) {
        const key = parseKey(src, start, keyEnd, lineNum);
        checkDup(target, key, lineNum);
        pos++;
        skipIndentOnly();
        if (pos < lines.length && lines[pos].depth > depth) {
          if (lines[pos].depth !== depth + 1) {
            throw new SawnError(
              "Invalid indentation jump",
              lines[pos].lineNum,
            );
          }
          const child: SawnObject = {};
          parseChildren(depth + 1, child);
          target[key] = child;
        } else {
          // §3.3: key{} with no indented children is a valid empty object
          target[key] = {};
        }
        continue;
      }

      // §3.5: key[][] — table declaration
      if (
        keyEnd < end && src.charCodeAt(keyEnd) === Ch.OpenBracket &&
        keyEnd + 4 <= end &&
        src.charCodeAt(keyEnd + 1) === Ch.CloseBracket &&
        src.charCodeAt(keyEnd + 2) === Ch.OpenBracket &&
        src.charCodeAt(keyEnd + 3) === Ch.CloseBracket
      ) {
        handleTableDecl(start, keyEnd, keyEnd + 4, end, depth, lineNum, target);
        continue;
      }

      // §3.4: key[] — array declaration
      if (
        keyEnd + 2 <= end &&
        src.charCodeAt(keyEnd) === Ch.OpenBracket &&
        src.charCodeAt(keyEnd + 1) === Ch.CloseBracket &&
        keyEnd + 2 === end
      ) {
        const key = parseKey(src, start, keyEnd, lineNum);
        checkDup(target, key, lineNum);
        pos++;
        skipIndentOnly();
        if (pos >= lines.length || lines[pos].depth <= depth) {
          // §3.4: key[] with no indented children is a valid empty array
          target[key] = [];
        } else {
          target[key] = parseArrayChildren(depth + 1);
        }
        continue;
      }

      // §3.2: bare key not followed by = or a recognized structure suffix is a parse error
      // §3: also covers space between key and suffix (e.g. "key {}")
      throw new SawnError(
        `Bare key "${
          src.slice(start, end)
        }" is not followed by = or a structure suffix ({},[],[][][])`,
        lineNum,
      );
    }
  }

  // =======================================================================
  // Array children: values, {}, [], [][]
  // =======================================================================

  function parseArrayChildren(depth: number): SawnArray {
    const arr: SawnArray = [];

    while (pos < lines.length) {
      if (lines[pos].indentOnly) {
        pos++;
        continue;
      }
      if (lines[pos].depth !== depth) break;
      const line = lines[pos];
      const { start, end, lineNum } = line;
      const len = end - start;
      const c0 = src.charCodeAt(start);

      // --- §3.6: {} (anonymous object element in array) ---
      if (
        c0 === Ch.OpenBrace && len === 2 &&
        src.charCodeAt(start + 1) === Ch.CloseBrace
      ) {
        pos++;
        skipIndentOnly();
        if (pos < lines.length && lines[pos].depth > depth) {
          if (lines[pos].depth !== depth + 1) {
            throw new SawnError(
              "Invalid indentation jump",
              lines[pos].lineNum,
            );
          }
          const obj: SawnObject = {};
          parseChildren(depth + 1, obj);
          arr.push(obj);
        } else {
          arr.push({});
        }
        continue;
      }

      // --- §3.7: anonymous [] or [][] ---
      if (
        c0 === Ch.OpenBracket && len >= 2 &&
        src.charCodeAt(start + 1) === Ch.CloseBracket
      ) {
        // [][] — anonymous table
        if (
          len >= 4 &&
          src.charCodeAt(start + 2) === Ch.OpenBracket &&
          src.charCodeAt(start + 3) === Ch.CloseBracket
        ) {
          if (len === 4) {
            // [][] with no columns — parse error
            throw new SawnError(
              "Table must have column names after [][]",
              lineNum,
            );
          }
          if (src.charCodeAt(start + 4) !== Ch.Space) {
            throw new SawnError("Expected space after [][]", lineNum);
          }
          const colStart = start + 5;
          const columns = parseTableHeader(src, colStart, end, lineNum);
          pos++;
          skipIndentOnly();
          const rows = parseTableRows(depth + 1, columns);
          arr.push(rows.length === 0 ? [] : rows);
          continue;
        }

        // [] — anonymous array
        if (len === 2) {
          pos++;
          skipIndentOnly();
          if (pos >= lines.length || lines[pos].depth <= depth) {
            arr.push([]);
            continue;
          }
          arr.push(parseArrayChildren(depth + 1));
          continue;
        }
      }

      // --- Default: scalar value ---
      arr.push(parseValue(src, start, end, lineNum, options));
      pos++;
      continue;
    }

    return arr;
  }

  // =======================================================================
  // Table rows
  // =======================================================================

  function parseTableRows(
    depth: number,
    columns: string[],
  ): SawnObject[] {
    const rows: SawnObject[] = [];
    while (pos < lines.length) {
      if (lines[pos].indentOnly) {
        pos++;
        continue;
      }
      if (lines[pos].depth !== depth) break;
      const line = lines[pos];
      rows.push(
        parseTableRow(
          src,
          line.start,
          line.end,
          line.lineNum,
          columns,
          options,
        ),
      );
      pos++;
    }
    return rows;
  }

  // =======================================================================
  // Table declaration helper
  // =======================================================================

  function handleTableDecl(
    keyStart: number,
    keyEnd: number,
    afterBrackets: number,
    end: number,
    depth: number,
    lineNum: number,
    target: SawnObject,
  ): void {
    const key = parseKey(src, keyStart, keyEnd, lineNum);
    checkDup(target, key, lineNum);

    if (afterBrackets >= end) {
      // key[][] with no columns — parse error
      throw new SawnError(
        "Table must have column names after [][]",
        lineNum,
      );
    }
    if (src.charCodeAt(afterBrackets) !== Ch.Space) {
      throw new SawnError("Expected space after [][]", lineNum);
    }
    const colStart = afterBrackets + 1;
    const columns = parseTableHeader(src, colStart, end, lineNum);
    pos++;
    skipIndentOnly();
    const rows = parseTableRows(depth + 1, columns);
    target[key] = rows.length === 0 ? [] : rows;
  }

  // =======================================================================
  // Multiline string (§2.2) — works on raw source
  // =======================================================================

  function collectMultilineString(
    keyDepth: number,
    keyLineNum: number,
    lineOffsets: number[],
    totalRawLines: number,
    src: string,
  ): string {
    const minDepth = keyDepth + 1;
    const baseIndent = minDepth * 2;
    const bodyLines: string[] = [];
    let rawLn = keyLineNum + 1;

    // §2.2: Validate first content line has at least base indentation
    if (rawLn <= totalRawLines) {
      const ls = lineOffsets[rawLn - 1];
      const le = rawLn < totalRawLines ? lineOffsets[rawLn] - 1 : src.length;
      let e2 = le;
      if (e2 > ls && src.charCodeAt(e2 - 1) === Ch.CR) e2--;
      let sp = 0;
      let ci2 = ls;
      while (ci2 < e2 && src.charCodeAt(ci2) === Ch.Space) {
        sp++;
        ci2++;
      }
      // Only validate if the line has content (not blank)
      if (ci2 < e2) {
        // §2.2: first content line must have at least (key_depth + 1) * 2 leading spaces
        if (sp < baseIndent) {
          throw new SawnError(
            `Expected at least ${baseIndent} leading spaces for multi-line string content, found ${sp}`,
            rawLn,
          );
        }
      }
    }

    while (rawLn <= totalRawLines) {
      const lineStart = lineOffsets[rawLn - 1];
      const lineEnd = rawLn < totalRawLines
        ? lineOffsets[rawLn] - 1
        : src.length;

      // Trim CR
      let end = lineEnd;
      if (end > lineStart && src.charCodeAt(end - 1) === Ch.CR) end--;

      // Count leading spaces
      let spaces = 0;
      let ci = lineStart;
      while (ci < end && src.charCodeAt(ci) === Ch.Space) {
        spaces++;
        ci++;
      }

      // Truly blank line (no characters or only whitespace with no indent)?
      if (ci >= end) {
        if (spaces === 0) break; // blank line → terminate
        // §2.2: collect if leading spaces >= base indentation
        if (spaces < baseIndent) break; // lesser indent → terminate
        // Indent-only line: preserve extra spaces beyond base indent as content
        if (spaces > baseIndent) {
          bodyLines.push(" ".repeat(spaces - baseIndent));
        } else {
          bodyLines.push("");
        }
        rawLn++;
        continue;
      }

      // §2.2: Content line — collect if leading spaces >= base indentation
      if (spaces < baseIndent) break; // lesser indent → terminate

      // No comment stripping — §1.3 string priority rule
      bodyLines.push(src.slice(lineStart + baseIndent, end));
      rawLn++;
    }

    if (bodyLines.length === 0) {
      throw new SawnError(
        'key= with no value requires indented continuation, or use key="" for empty string',
        keyLineNum,
      );
    }

    lastMultilineEndLine = rawLn;
    return bodyLines.join("\n");
  }

  function syncPosAfterMultiline(): void {
    while (
      pos < lines.length && lines[pos].lineNum < lastMultilineEndLine
    ) {
      pos++;
    }
  }

  // =======================================================================
  // Utilities
  // =======================================================================

  function skipIndentOnly(): void {
    while (pos < lines.length && lines[pos].indentOnly) pos++;
  }

  // §3.2: duplicate keys among direct members of the same object are a parse error
  function checkDup(target: SawnObject, key: string, lineNum: number): void {
    if (key in target) {
      throw new SawnError(`Duplicate key "${key}"`, lineNum);
    }
  }

  // §4: anonymous root must be the sole root-level entry
  function assertNoMore(): void {
    while (pos < lines.length && lines[pos].indentOnly) pos++;
    if (pos < lines.length) {
      throw new SawnError(
        "Anonymous root must not contain other entries",
        lines[pos].lineNum,
      );
    }
  }
};

// =========================================================================
// Module-level helpers
// =========================================================================

/** §1.7, §3.2: Skip past a key (quoted string or bare IDENT) and return the position after it. */
const scanKeyEnd = (src: string, start: number, end: number): number => {
  if (src.charCodeAt(start) === Ch.Quote) {
    let i = start + 1;
    while (i < end) {
      const c = src.charCodeAt(i);
      if (c === Ch.Backslash && i + 1 < end) {
        i += 2;
        continue;
      }
      if (c === Ch.Quote) return i + 1;
      i++;
    }
    return end;
  }
  let i = start;
  const c0 = src.charCodeAt(i);
  if (
    !((c0 >= Ch.a && c0 <= Ch.z) || (c0 >= Ch.A && c0 <= Ch.Z) ||
      c0 === Ch.Underscore)
  ) return start;
  i++;
  while (i < end) {
    const c = src.charCodeAt(i);
    if (
      !((c >= Ch.a && c <= Ch.z) || (c >= Ch.A && c <= Ch.Z) ||
        (c >= Ch.Zero && c <= Ch.Nine) || c === Ch.Underscore)
    ) break;
    i++;
  }
  return i;
};

/** §1.3, §3.1: Find '=' outside quoted strings (string priority rule). */
const findEquals = (src: string, start: number, end: number): number => {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c === Ch.Equals) return i;
    if (c === Ch.Quote) {
      // Skip past quoted string content
      i++;
      while (i < end) {
        const q = src.charCodeAt(i);
        if (q === Ch.Backslash && i + 1 < end) {
          i += 2;
          continue;
        }
        if (q === Ch.Quote) break;
        i++;
      }
    }
  }
  return -1;
};

// =========================================================================
// Line preparation
// =========================================================================

interface PreparedLines {
  lines: Line[];
  lineOffsets: number[];
  totalRawLines: number;
}

const prepareLines = (src: string): PreparedLines => {
  const len = src.length;
  const lines: Line[] = [];

  // §1.1: reject byte order mark (BOM, U+FEFF)
  if (len > 0 && src.charCodeAt(0) === 0xFEFF) {
    throw new SawnError(
      "Document must not begin with a byte order mark (BOM)",
      1,
    );
  }

  // Build raw line offsets (1-indexed: lineOffsets[0] = start of line 1)
  // Single pass over the document — reused below to avoid a second indexOf scan
  const lineOffsets: number[] = [0];
  for (let i = 0; i < len; i++) {
    if (src.charCodeAt(i) === Ch.LF) lineOffsets.push(i + 1);
  }
  const totalRawLines = lineOffsets.length;

  // §2.2: Track multi-line string scope so we skip stripComment for content lines.
  // prepareLines detects `key=` (value-less assignment) and marks subsequent
  // deeper-indented lines as multi-line content. collectMultilineString reads
  // from the original src, so these lines just need to exist in the lines array
  // for syncPosAfterMultiline to skip them correctly.
  let inMultiline = false;
  let mlKeyDepth = -1;

  for (let lineNum = 1; lineNum <= totalRawLines; lineNum++) {
    const lineStart = lineOffsets[lineNum - 1];
    const lineEnd = lineNum < totalRawLines ? lineOffsets[lineNum] - 1 : len;

    let rawEnd = lineEnd;
    if (rawEnd > lineStart && src.charCodeAt(rawEnd - 1) === Ch.CR) rawEnd--;

    // Count leading spaces
    let indent = 0;
    let i = lineStart;
    while (i < rawEnd && src.charCodeAt(i) === Ch.Space) {
      indent++;
      i++;
    }

    // §1.4: tabs are not allowed
    if (i < rawEnd && src.charCodeAt(i) === Ch.Tab) {
      throw new SawnError("Tab indentation is not allowed", lineNum);
    }

    const contentStart = lineStart + indent;

    // Trim trailing whitespace from raw content
    let trimEnd = rawEnd;
    while (trimEnd > contentStart && src.charCodeAt(trimEnd - 1) <= Ch.Space) {
      trimEnd--;
    }

    // §2.2: Multi-line string content lines — skip even-indent check and
    // comment processing. The base indentation (always even) is structural;
    // characters beyond it (including odd spaces) are content (§1.4).
    if (inMultiline) {
      const mlBaseIndent = (mlKeyDepth + 1) * 2;

      // §1.5: blank lines carry no structural meaning
      if (contentStart >= trimEnd) {
        if (indent === 0) {
          // blank line → terminate multi-line string
          inMultiline = false;
          continue;
        }
        // §2.2: indent-only line within multi-line string scope
        if (indent >= mlBaseIndent) {
          const depth = Math.floor(indent / 2);
          lines.push({
            lineNum,
            depth,
            start: contentStart,
            end: contentStart,
            indentOnly: true,
          });
        } else {
          // indent less than base → terminate
          inMultiline = false;
          // Re-check as structural line below
        }
        if (inMultiline) continue;
      } else if (indent >= mlBaseIndent) {
        // Content line — no comment stripping per §2.2
        const depth = Math.floor(indent / 2);
        lines.push({ lineNum, depth, start: contentStart, end: trimEnd });
        continue;
      } else {
        // Indent less than base → terminate multi-line string
        inMultiline = false;
        // Fall through to process as structural line
      }
    }

    // §1.4: indentation must be a multiple of 2 spaces (structural lines only)
    if (indent > 0 && indent % 2 !== 0) {
      throw new SawnError(
        "Invalid indentation (must be multiple of 2 spaces)",
        lineNum,
      );
    }

    const depth = indent / 2;

    // §1.5: blank lines carry no structural meaning and are ignored
    // §1.6: trailing whitespace is stripped above (trimEnd)
    if (contentStart >= trimEnd) {
      // Include indent-only lines (have spaces but no content)
      if (indent > 0) {
        lines.push({
          lineNum,
          depth,
          start: contentStart,
          end: contentStart,
          indentOnly: true,
        });
      }
      // Truly blank (no chars at all) → skip entirely
      continue;
    }

    // Strip comments
    const contentEnd = stripComment(src, contentStart, trimEnd, lineNum);
    if (contentEnd <= contentStart) {
      // Comment-only line
      continue;
    }

    lines.push({
      lineNum,
      depth,
      start: contentStart,
      end: contentEnd,
    });

    // Detect multi-line string introduction: line ends with `=` after a key
    if (src.charCodeAt(contentEnd - 1) === Ch.Equals) {
      const eqIdx = findEquals(src, contentStart, contentEnd);
      if (eqIdx !== -1 && eqIdx === contentEnd - 1) {
        inMultiline = true;
        mlKeyDepth = depth;
      }
    }
  }

  return { lines, lineOffsets, totalRawLines };
};
