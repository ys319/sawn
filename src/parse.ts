/**
 * Sawn v1.0 Parser — stack-based, single-pass streaming implementation.
 * No prepareLines pre-pass: lines are read on-demand from a source cursor.
 * Uses an explicit stack instead of call-stack recursion.
 */

import { Ch } from "./constants.ts";
import { parseKey, parseValue } from "./decode.ts";
import { stripComment } from "./hacks.ts";
import { SawnError } from "./error.ts";
import { parseTableHeader, parseTableRow } from "./saws.ts";
import type { ParseOptions, SawnArray, SawnObject } from "./types.ts";

// =========================================================================
// Stack frame types
// =========================================================================

const enum FrameKind {
  Object,
  Array,
  Table,
}

interface ObjectFrame {
  kind: FrameKind.Object;
  depth: number;
  target: SawnObject;
}

interface ArrayFrame {
  kind: FrameKind.Array;
  depth: number;
  target: SawnArray;
}

interface TableFrame {
  kind: FrameKind.Table;
  depth: number;
  columns: string[];
  target: SawnArray;
}

type Frame = ObjectFrame | ArrayFrame | TableFrame;

// =========================================================================
// Streaming line info (no pre-allocated array)
// =========================================================================

interface LineInfo {
  lineNum: number;
  depth: number;
  start: number;
  end: number;
  indentOnly: boolean;
}

// =========================================================================
// Public API
// =========================================================================

/** Parse a Sawn document string into a JavaScript object or array (stack-based, streaming). */
export const parse = (
  input: string,
  options: ParseOptions = {},
): SawnObject | SawnArray => {
  const src = input;
  const len = src.length;

  // §1.1: reject byte order mark (BOM, U+FEFF)
  if (len > 0 && src.charCodeAt(0) === 0xFEFF) {
    throw new SawnError(
      "Document must not begin with a byte order mark (BOM)",
      1,
    );
  }

  // Streaming state — source cursor and line counter
  let srcPos = 0;
  let rawLineNum = 0;

  // Reusable line info buffer — avoids per-line object allocation
  let lineValid = false;
  const curLine: LineInfo = {
    lineNum: 0,
    depth: 0,
    start: 0,
    end: 0,
    indentOnly: false,
  };

  // =======================================================================
  // Streaming line reader
  // =======================================================================

  /** Fill curLine buffer with next structural line. Returns true if line found. */
  function fillNextLine(): boolean {
    while (srcPos < len) {
      rawLineNum++;
      const lineStart = srcPos;

      // Find end of line — V8's indexOf is SIMD-optimized, faster than charCodeAt loop
      let lineEnd = src.indexOf("\n", srcPos);
      if (lineEnd === -1) lineEnd = len;
      srcPos = lineEnd < len ? lineEnd + 1 : lineEnd;

      // §1.1: CR+LF normalization — trim trailing CR
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
        throw new SawnError("Tab indentation is not allowed", rawLineNum);
      }

      // §1.4: indentation must be a multiple of 2 spaces
      if (indent > 0 && indent % 2 !== 0) {
        throw new SawnError(
          "Invalid indentation (must be multiple of 2 spaces)",
          rawLineNum,
        );
      }

      const depth = indent >> 1;
      const contentStart = lineStart + indent;

      // Trim trailing whitespace
      let trimEnd = rawEnd;
      while (
        trimEnd > contentStart && src.charCodeAt(trimEnd - 1) <= Ch.Space
      ) {
        trimEnd--;
      }

      // §1.5: blank / indent-only lines
      if (contentStart >= trimEnd) {
        if (indent > 0) {
          curLine.lineNum = rawLineNum;
          curLine.depth = depth;
          curLine.start = contentStart;
          curLine.end = contentStart;
          curLine.indentOnly = true;
          return true;
        }
        continue; // truly blank
      }

      // §1.2: strip comments
      const contentEnd = stripComment(src, contentStart, trimEnd, rawLineNum);
      if (contentEnd <= contentStart) continue; // comment-only

      curLine.lineNum = rawLineNum;
      curLine.depth = depth;
      curLine.start = contentStart;
      curLine.end = contentEnd;
      curLine.indentOnly = false;
      return true;
    }
    return false;
  }

  function peekLine(): LineInfo | null {
    if (lineValid) return curLine;
    if (!fillNextLine()) return null;
    lineValid = true;
    return curLine;
  }

  function consumeLine(): void {
    lineValid = false;
  }

  function skipIndentOnly(): void {
    while (true) {
      const l = peekLine();
      if (!l || !l.indentOnly) break;
      consumeLine();
    }
  }

  // =======================================================================
  // Multi-line string collection (§2.2) — reads raw lines from source cursor
  // =======================================================================

  function collectMultilineString(keyDepth: number, keyLn: number): string {
    const baseIndent = (keyDepth + 1) * 2;
    const bodyLines: string[] = [];

    // Invalidate cached structural line — we're reading raw lines now
    lineValid = false;

    while (srcPos < len) {
      // Save cursor in case we need to "put back" a structural line
      const savedPos = srcPos;
      const savedLn = rawLineNum;

      rawLineNum++;
      const lineStart = srcPos;
      let lineEnd = src.indexOf("\n", srcPos);
      if (lineEnd === -1) lineEnd = len;
      srcPos = lineEnd < len ? lineEnd + 1 : lineEnd;

      // CR trim
      let rawEnd = lineEnd;
      if (rawEnd > lineStart && src.charCodeAt(rawEnd - 1) === Ch.CR) rawEnd--;

      // Count leading spaces
      let spaces = 0;
      let ci = lineStart;
      while (ci < rawEnd && src.charCodeAt(ci) === Ch.Space) {
        spaces++;
        ci++;
      }

      // Blank or indent-only line
      if (ci >= rawEnd) {
        if (spaces === 0) break; // truly blank → terminate, consume
        if (spaces < baseIndent) {
          // Not enough indent → terminate, put back for structural processing
          srcPos = savedPos;
          rawLineNum = savedLn;
          break;
        }
        // §2.2: indent-only line within multiline scope
        bodyLines.push(
          spaces > baseIndent ? " ".repeat(spaces - baseIndent) : "",
        );
        continue;
      }

      // Content line
      if (spaces < baseIndent) {
        // §2.2: first content line must have at least base indentation
        if (bodyLines.length === 0) {
          throw new SawnError(
            `Expected at least ${baseIndent} leading spaces for multi-line string content, found ${spaces}`,
            rawLineNum,
          );
        }
        // Not enough indent → terminate, put back
        srcPos = savedPos;
        rawLineNum = savedLn;
        break;
      }

      // §2.2: no comment stripping for multi-line string content (§1.3 string priority)
      bodyLines.push(src.slice(lineStart + baseIndent, rawEnd));
    }

    if (bodyLines.length === 0) {
      throw new SawnError(
        'key= with no value requires indented continuation, or use key="" for empty string',
        keyLn,
      );
    }

    return bodyLines.join("\n");
  }

  // =======================================================================
  // Root parsing
  // =======================================================================

  // §4: find first non-indent-only line
  skipIndentOnly();
  const first = peekLine();
  if (!first || first.indentOnly) {
    throw new SawnError("Document contains no entries", 1);
  }

  // §4: Anonymous root detection
  if (first.depth === 0) {
    const c0 = src.charCodeAt(first.start);
    const fLen = first.end - first.start;

    // §4: anonymous {} at root level is a parse error
    if (
      c0 === Ch.OpenBrace && fLen === 2 &&
      src.charCodeAt(first.start + 1) === Ch.CloseBrace
    ) {
      throw new SawnError(
        "Anonymous {} at root level is a parse error; the implicit root is already an object",
        first.lineNum,
      );
    }

    // §3.7: anonymous [] or [][]
    if (
      c0 === Ch.OpenBracket && fLen >= 2 &&
      src.charCodeAt(first.start + 1) === Ch.CloseBracket
    ) {
      // Anonymous table: [][] col1,col2
      if (
        fLen >= 4 &&
        src.charCodeAt(first.start + 2) === Ch.OpenBracket &&
        src.charCodeAt(first.start + 3) === Ch.CloseBracket
      ) {
        return handleAnonTable(first, fLen);
      }

      // Anonymous array: []
      if (fLen === 2) {
        consumeLine();
        skipIndentOnly();
        const next = peekLine();
        if (!next) return [];
        if (next.depth < 1) {
          // §4: anonymous root must be the sole entry
          assertNoMore();
          return [];
        }
        const arr = runArrayLoop(1);
        assertNoMore();
        return arr;
      }
    }
  }

  // Normal object root
  const result = runObjectLoop(0);
  assertDone();
  return result;

  // =======================================================================
  // Stack-based main loops
  // =======================================================================

  function runLoop<T>(initialFrame: Frame & { target: T }): T {
    const root = initialFrame.target;
    const stack: Frame[] = [initialFrame];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const line = peekLine();
      if (!line) {
        stack.pop();
        continue;
      }

      if (line.indentOnly) {
        consumeLine();
        continue;
      }

      if (line.depth < frame.depth) {
        stack.pop();
        continue;
      }
      if (line.depth > frame.depth) {
        throw new SawnError("Invalid indentation jump", line.lineNum);
      }

      switch (frame.kind) {
        case FrameKind.Object:
          processObjectLine(frame, line, stack);
          break;
        case FrameKind.Array:
          processArrayLine(frame, line, stack);
          break;
        case FrameKind.Table:
          processTableRowFn(frame, line);
          break;
      }
    }

    return root;
  }

  function runObjectLoop(startDepth: number): SawnObject {
    return runLoop<SawnObject>({
      kind: FrameKind.Object,
      depth: startDepth,
      target: {} as SawnObject,
    });
  }

  function runArrayLoop(startDepth: number): SawnArray {
    return runLoop<SawnArray>({
      kind: FrameKind.Array,
      depth: startDepth,
      target: [] as SawnArray,
    });
  }

  // =======================================================================
  // Object line processing
  // =======================================================================

  function processObjectLine(
    frame: ObjectFrame,
    line: LineInfo,
    stack: Frame[],
  ): void {
    const { start, end, lineNum } = line;
    const depth = frame.depth;
    const target = frame.target;

    // Scan key once — determines key end and whether isIdent was validated
    const keyEnd = scanKeyEnd(src, start, end);
    const bareIdent = keyEnd > start && src.charCodeAt(start) !== Ch.Quote;

    // §3.1: key=value — check if '=' follows the key
    if (keyEnd < end && src.charCodeAt(keyEnd) === Ch.Equals) {
      const key = parseKey(src, start, keyEnd, lineNum, bareIdent);
      checkDup(target, key, lineNum);
      const valStart = keyEnd + 1;

      // key= (multiline string §2.2)
      if (valStart === end) {
        consumeLine();
        target[key] = collectMultilineString(depth, lineNum);
        return;
      }

      target[key] = parseValue(src, valStart, end, lineNum, options);
      consumeLine();
      return;
    }

    // §3.3: key{} — object declaration
    if (
      keyEnd + 2 <= end &&
      src.charCodeAt(keyEnd) === Ch.OpenBrace &&
      src.charCodeAt(keyEnd + 1) === Ch.CloseBrace &&
      keyEnd + 2 === end
    ) {
      const key = parseKey(src, start, keyEnd, lineNum, bareIdent);
      checkDup(target, key, lineNum);
      consumeLine();
      skipIndentOnly();
      const next = peekLine();
      if (next && !next.indentOnly && next.depth > depth) {
        if (next.depth !== depth + 1) {
          throw new SawnError("Invalid indentation jump", next.lineNum);
        }
        const child: SawnObject = {};
        target[key] = child;
        stack.push({
          kind: FrameKind.Object,
          depth: depth + 1,
          target: child,
        });
      } else {
        target[key] = {};
      }
      return;
    }

    // §3.5: key[][] — table declaration
    if (
      keyEnd < end && src.charCodeAt(keyEnd) === Ch.OpenBracket &&
      keyEnd + 4 <= end &&
      src.charCodeAt(keyEnd + 1) === Ch.CloseBracket &&
      src.charCodeAt(keyEnd + 2) === Ch.OpenBracket &&
      src.charCodeAt(keyEnd + 3) === Ch.CloseBracket
    ) {
      const key = parseKey(src, start, keyEnd, lineNum, bareIdent);
      checkDup(target, key, lineNum);
      const afterBrackets = keyEnd + 4;
      if (afterBrackets >= end) {
        throw new SawnError("Table must have column names after [][]", lineNum);
      }
      if (src.charCodeAt(afterBrackets) !== Ch.Space) {
        throw new SawnError("Expected space after [][]", lineNum);
      }
      const colStart = afterBrackets + 1;
      const columns = parseTableHeader(src, colStart, end, lineNum);
      consumeLine();
      skipIndentOnly();
      const rows: SawnArray = [];
      target[key] = rows;
      stack.push({
        kind: FrameKind.Table,
        depth: depth + 1,
        columns,
        target: rows,
      });
      return;
    }

    // §3.4: key[] — array declaration
    if (
      keyEnd + 2 <= end &&
      src.charCodeAt(keyEnd) === Ch.OpenBracket &&
      src.charCodeAt(keyEnd + 1) === Ch.CloseBracket &&
      keyEnd + 2 === end
    ) {
      const key = parseKey(src, start, keyEnd, lineNum, bareIdent);
      checkDup(target, key, lineNum);
      consumeLine();
      skipIndentOnly();
      const next = peekLine();
      if (!next || next.depth <= depth) {
        target[key] = [];
      } else {
        const arr: SawnArray = [];
        target[key] = arr;
        stack.push({
          kind: FrameKind.Array,
          depth: depth + 1,
          target: arr,
        });
      }
      return;
    }

    // Better error: space between key and structure suffix
    if (keyEnd > start && keyEnd < end && src.charCodeAt(keyEnd) === Ch.Space) {
      let sp = keyEnd;
      while (sp < end && src.charCodeAt(sp) === Ch.Space) sp++;
      const rem = end - sp;
      let suffix = "";
      if (
        rem === 2 && src.charCodeAt(sp) === Ch.OpenBrace &&
        src.charCodeAt(sp + 1) === Ch.CloseBrace
      ) {
        suffix = "{}";
      } else if (
        rem >= 4 && src.charCodeAt(sp) === Ch.OpenBracket &&
        src.charCodeAt(sp + 1) === Ch.CloseBracket &&
        src.charCodeAt(sp + 2) === Ch.OpenBracket &&
        src.charCodeAt(sp + 3) === Ch.CloseBracket
      ) {
        suffix = "[][]";
      } else if (
        rem === 2 && src.charCodeAt(sp) === Ch.OpenBracket &&
        src.charCodeAt(sp + 1) === Ch.CloseBracket
      ) {
        suffix = "[]";
      }
      if (suffix) {
        throw new SawnError(
          `Unexpected space between key and '${suffix}'; use '${
            src.slice(start, keyEnd)
          }${suffix}' with no space`,
          lineNum,
        );
      }
    }

    // §1.7: better error for unterminated quoted key
    if (keyEnd === end && src.charCodeAt(start) === Ch.Quote) {
      throw new SawnError("Unterminated quoted key", lineNum);
    }

    // §3.2: key not followed by = or a recognized structure suffix
    throw new SawnError(
      `Key "${
        src.slice(start, end)
      }" is not followed by = or a structure suffix ({}, [], [][])`,
      lineNum,
    );
  }

  // =======================================================================
  // Array line processing
  // =======================================================================

  function processArrayLine(
    frame: ArrayFrame,
    line: LineInfo,
    stack: Frame[],
  ): void {
    const { start, end, lineNum } = line;
    const depth = frame.depth;
    const arr = frame.target;
    const fLen = end - start;
    const c0 = src.charCodeAt(start);

    // §3.6: {} (anonymous object element in array)
    if (
      c0 === Ch.OpenBrace && fLen === 2 &&
      src.charCodeAt(start + 1) === Ch.CloseBrace
    ) {
      consumeLine();
      skipIndentOnly();
      const next = peekLine();
      if (next && !next.indentOnly && next.depth > depth) {
        if (next.depth !== depth + 1) {
          throw new SawnError("Invalid indentation jump", next.lineNum);
        }
        const obj: SawnObject = {};
        arr.push(obj);
        stack.push({
          kind: FrameKind.Object,
          depth: depth + 1,
          target: obj,
        });
      } else {
        arr.push({});
      }
      return;
    }

    // §3.7: anonymous [] or [][]
    if (
      c0 === Ch.OpenBracket && fLen >= 2 &&
      src.charCodeAt(start + 1) === Ch.CloseBracket
    ) {
      // [][] — anonymous table
      if (
        fLen >= 4 &&
        src.charCodeAt(start + 2) === Ch.OpenBracket &&
        src.charCodeAt(start + 3) === Ch.CloseBracket
      ) {
        if (fLen === 4) {
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
        consumeLine();
        skipIndentOnly();
        const rows: SawnArray = [];
        arr.push(rows);
        stack.push({
          kind: FrameKind.Table,
          depth: depth + 1,
          columns,
          target: rows,
        });
        return;
      }

      // [] — anonymous array
      if (fLen === 2) {
        consumeLine();
        skipIndentOnly();
        const next = peekLine();
        if (!next || next.depth <= depth) {
          arr.push([]);
        } else {
          const child: SawnArray = [];
          arr.push(child);
          stack.push({
            kind: FrameKind.Array,
            depth: depth + 1,
            target: child,
          });
        }
        return;
      }
    }

    // Default: scalar value
    arr.push(parseValue(src, start, end, lineNum, options));
    consumeLine();
  }

  // =======================================================================
  // Table row processing
  // =======================================================================

  function processTableRowFn(
    frame: TableFrame,
    line: LineInfo,
  ): void {
    frame.target.push(
      parseTableRow(
        src,
        line.start,
        line.end,
        line.lineNum,
        frame.columns,
        options,
      ),
    );
    consumeLine();
  }

  // =======================================================================
  // Anonymous table helper
  // =======================================================================

  function handleAnonTable(first: LineInfo, fLen: number): SawnArray {
    if (fLen === 4) {
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
    consumeLine();
    skipIndentOnly();
    const rows = runLoop<SawnArray>({
      kind: FrameKind.Table,
      depth: 1,
      columns,
      target: [],
    });
    assertNoMore();
    return rows;
  }

  // =======================================================================
  // Utilities
  // =======================================================================

  function checkDup(target: SawnObject, key: string, lineNum: number): void {
    // Prototype pollution prevention (implementation-level, not in spec)
    if (key === "__proto__") {
      throw new SawnError('Key "__proto__" is not allowed', lineNum);
    }
    if (Object.hasOwn(target, key)) {
      throw new SawnError(`Duplicate key "${key}"`, lineNum);
    }
  }

  function assertNoMore(): void {
    skipIndentOnly();
    const line = peekLine();
    if (line && !line.indentOnly) {
      throw new SawnError(
        "Anonymous root must not contain other entries",
        line.lineNum,
      );
    }
  }

  function assertDone(): void {
    const line = peekLine();
    if (line && !line.indentOnly) {
      throw new SawnError("Unexpected content", line.lineNum);
    }
  }
};

// =========================================================================
// Module-level helpers (shared with parse.ts logic)
// =========================================================================

/** §1.7, §3.2: Skip past a key and return position after it. */
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
