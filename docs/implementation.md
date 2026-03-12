# Sawn Implementation Guide

This document provides non-normative guidance for implementers of Sawn (v1.0)
parsers and serializers. For the authoritative specification, see
[spec.md](spec.md).

The key words "SHOULD" and "MAY" in this document are to be interpreted as
described in RFC 2119. All normative requirements (MUST, MUST NOT) are defined
in the specification; this document does not introduce new normative
requirements.

## String Encoding

### `\xHH` and UTF-8

The `\xHH` escape denotes a Unicode code point, not a raw byte value. The
resulting code point is encoded as UTF-8 in the output. For example, `\x80`
produces U+0080 (encoded as the two-byte UTF-8 sequence `0xC2 0x80`), not the
single byte `0x80`. Similarly, `\xff` produces U+00FF (ÿ), encoded as the
two-byte UTF-8 sequence `0xC3 0xBF`. Implementations that emit raw byte values
will produce invalid UTF-8 for code points above U+007F.

A correct round-trip test: parsing `"\xff"` must produce the same string as the
literal character ÿ (U+00FF).

### Serializer Escape Preferences

Serializers SHOULD prefer named escapes where available (e.g. `\n` rather than
`\x0a`). For control characters without a named escape (U+0001–U+0006,
U+000E–U+001F), the `\xHH` form is required (see §2.1 of the specification). The
hex digits in `\xHH` SHOULD be lowercase.

## Parser Implementation Notes

### Multi-line String Parsing Algorithm

A multi-line string (§2.2) is parsed as follows:

1. Detect: `=` is followed by only optional trailing whitespace (and optional
   inline comment) and a line break.
2. Compute the base indentation: `(key_depth + 1) × 2` spaces. This is fixed and
   does not depend on the first content line's actual indentation.
3. Read the next non-blank line. If it has fewer leading spaces than the base
   indentation, emit a parse error.
4. Collect content lines: read subsequent lines while each line has at least as
   many leading spaces as the base indentation. Lines with exactly the base
   indentation and no further content are collected as empty content lines.
   Leading spaces beyond the base indentation are preserved as content — the
   even-indent rule (§1.4) does not apply to content lines.
5. Terminate: stop collecting when a line has fewer leading spaces than the base
   indentation, a blank line (0 spaces), or EOF is encountered. The terminating
   line is not consumed (it remains available for subsequent parsing).
6. Strip the base indentation from each collected line, join with LF.

### Multi-line String Scope and Comment Processing

Comment processing (§1.2) is not applied to collected content lines of
multi-line strings (§2.2). Per the string priority rule (§1.3), `//` within a
multi-line string is literal content, not a comment delimiter. Implementations
SHOULD ensure that content lines are never subject to comment stripping.

Two common strategies exist:

- **Preprocessing pass:** Implementations that strip comments before the main
  parse phase must track multi-line string scope. Detect `key=` with no value on
  the same line (after stripping any inline comment on that line) and mark
  subsequent indented lines as content lines. Content lines within multi-line
  string scope should not have comment stripping applied.
- **Single-pass streaming:** A streaming parser that reads lines on demand can
  switch to raw line reading when it encounters a multi-line string trigger. In
  this approach, content lines are collected directly from the source without
  passing through comment stripping logic.

### Bare Token Boundaries

A bare token (unquoted value) extends from its first character to the next
boundary: a comma (`,`), whitespace (U+0020), the comment sequence `//`, or end
of line. In table data rows, commas delimit values; in non-table contexts
(key-value pairs, array elements), the entire non-whitespace, non-comment
content of the line is the token. This boundary rule is implicit in the
specification (§2, §3.4, §3.5) and does not need special-case handling beyond
normal tokenization.

### Bare Token Resolution Order

When resolving bare tokens (§2.7), `-inf` must be resolved before attempting
number parsing. A parser that tests for number syntax first would incorrectly
consume the `-` prefix and then fail on `inf`. The token `-inf` is a single
indivisible token and should not be decomposed into `-` and `inf`.

### Whitespace Around `=`

Implementations need not detect whitespace around `=` as a special case. Since
`=` is found by scanning from the start of the line, a space before `=` becomes
part of the key token (which fails IDENT validation), and a space after `=`
becomes part of the value token (which fails value parsing). Both cases produce
parse errors through the normal key and value validation paths. However, to
provide user-friendly diagnostics, implementations MAY detect this pattern
explicitly and emit a targeted error message (see "Space around `=`" in the
error table below) rather than relying on the generic key/value validation
failure.

### Table Parsing Delegation

Sawn implementations SHOULD delegate `[][]` block parsing to a Saws parser
internally. This promotes code reuse between the Sawn `[][]` syntax and the
standalone Saws format (§5), but is an implementation recommendation, not a
requirement.

## Error Reporting Guidelines

### General Principles

Implementations SHOULD include the following information in parse error
messages:

- **Line number and column number** (1-indexed) of the position where the error
  was detected.
- **A description of what was found** and **what was expected** at that
  position.

### Common Errors and Suggested Messages

The following table lists common error conditions and recommended diagnostic
messages. Implementations MAY use different wording but SHOULD convey equivalent
information.

| Condition                                 | Suggested message                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Space around `=`                          | "unexpected whitespace around '='; use 'key=value' with no spaces"                                      |
| Bare reserved word as key                 | "bare reserved word '{word}' cannot be used as a key; quote it as '\"{word}\"'"                         |
| Tab character in indentation              | "tab character in indentation; use 2-space indentation"                                                 |
| Odd number of leading spaces              | "indentation must be a multiple of 2 spaces"                                                            |
| Multi-line string followed by wrong depth | "expected indentation of {n} spaces for multi-line string content, found {m}"                           |
| Empty document                            | "document contains no entries"                                                                          |
| Anonymous root mixed with named entries   | "anonymous root array/table must be the only root-level entry; found additional entries"                |
| Duplicate key                             | "duplicate key '{key}' in object at line {n}"                                                           |
| Unrecognized escape sequence              | "unknown escape sequence '\\{c}'; supported: \\\\, \\\", \\0, \\a, \\b, \\t, \\n, \\v, \\f, \\r, \\xHH" |
| Column count mismatch in table            | "table row has {n} values but header declares {m} columns"                                              |
| Space between key and structure suffix    | "unexpected space between key and suffix; use 'key{}' with no space"                                    |
| Anonymous `{}` at root level              | "anonymous {} at root level is not allowed; the implicit root is already an object"                     |
| Byte order mark (BOM)                     | "document must not begin with a byte order mark (BOM)"                                                  |
