# Sawn v1.0 Specification

**Serialized As Written Notation**

## Status

March 2026

## Abstract

Sawn is a UTF-8 text-based data serialization format. It provides a strict,
indentation-based tree structure with an embedded tabular notation for
homogeneous data. Sawn's type system extends JSON's primitives with `inf`,
`-inf`, and `nan`.

The recommended file extension is `.sawn`. The recommended media type is
`application/x-sawn`.

The key words "MUST", "MUST NOT", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"MAY", and "OPTIONAL" in this document are to be interpreted as described in
RFC 2119.

## 1. Lexical Structure

Examples in this specification use the `key=value` form; whitespace around `=`
is not permitted (§3.1).

### 1.1 Encoding

A Sawn document MUST be a sequence of Unicode code points encoded in UTF-8.

A Sawn document MUST NOT begin with a byte order mark (BOM, U+FEFF).

The line terminator is U+000A (LF). Implementations SHOULD accept U+000D U+000A
(CRLF) and normalize it to LF before parsing. The presence or absence of a
trailing LF at end of file does not affect the meaning of the final line.

### 1.2 Comments

The character sequence `//` begins a comment. All characters from `//` to the
end of the line are ignored. Comments are permitted on any line: standalone,
after a key-value pair, after a structure declaration, or after a table row. The
exception is multi-line string content lines (§2.2), where `//` is literal
content per the string priority rule (§1.3).

An inline comment (one that follows other content on the same line) MUST be
preceded by at least one U+0020 (SPACE) character. A `//` immediately adjacent
to a value (e.g. `42//comment` or `"hello"//comment`) is a parse error.

```
// standalone comment
key="value"  // inline comment
```

### 1.3 String Priority Rule

Characters that carry structural meaning outside of strings — such as `//`, `,`,
`=`, and structure suffixes — have no special meaning within a string value
(whether quoted or multi-line). For quoted strings, implementations MUST
complete string tokenization before applying any structural or comment parsing
rules. For multi-line strings (§2.2), content lines are collected by indentation
before any structural or comment parsing is applied; see §2.2 for details. In
particular, `//` within a quoted string (e.g. `"http://example.com"`) is part of
the string value and does not introduce a comment.

```
url="http://example.com"  // the // inside the string is not a comment
data="a,b,c"              // the commas inside the string are not delimiters
```

### 1.4 Indentation

Each level of nesting is represented by exactly two U+0020 (SPACE) characters. A
line's _depth_ is defined as the number of consecutive 2-space units at the
start of the line. On structural lines (key-value pairs, structure declarations,
array elements, and table rows), the number of leading spaces MUST be a multiple
of 2; an odd number of leading spaces is a parse error. Use of horizontal tabs
(U+0009) or any indentation width other than two spaces is a parse error.

Within multi-line string content lines (§2.2), the base indentation is always a
multiple of 2 and is stripped by the parser. Characters beyond the base
indentation — including additional spaces — are content and are not subject to
the even-indent rule.

### 1.5 Blank Lines

A line that is empty or contains only whitespace carries no structural meaning
and is ignored by the parser, except within multi-line string collection (§2.2),
where a blank line terminates the content block.

### 1.6 Trailing Whitespace

Trailing whitespace (U+0020 characters after the last meaningful token on a
line) is ignored by the parser. A line's meaning is determined solely by its
non-whitespace content and any inline comment.

### 1.7 Identifiers

An _identifier_ (IDENT) is a sequence of characters matching the pattern:

```
[a-zA-Z_][a-zA-Z0-9_]*
```

Identifiers are used for keys and column names where quoting is not required.
Keys containing characters outside this pattern (e.g. dots, hyphens, spaces)
MUST be quoted. Note that tokens beginning with `-` (such as `-inf`) do not
match IDENT; see §3.2 for the full key quoting rules including reserved words.

## 2. Values

Sawn determines type by surface syntax according to a single rule: bare
(unquoted) tokens are primitives; quoted tokens are strings. A bare token that
does not match any defined primitive form is a parse error.

Values are always scalars. Structures (objects, arrays, tables) are not values;
they are declared with explicit suffixes (§3).

### 2.1 Strings

A string is a sequence of characters enclosed in double quotation marks
(U+0022). Single quotation marks and bare (unquoted) strings are not permitted.

A string MUST NOT contain a literal U+000A (LF). A string MUST NOT contain
_literal_ control characters in the range U+0000 through U+001F (this includes
U+0009, horizontal tab). All control characters in this range are representable
via escape sequences (see tables below); the restriction applies only to their
_literal_ (unescaped) appearance within a string.

Literal C1 control characters (U+0080–U+009F) SHOULD NOT appear in strings.
These characters are representable via `\xHH` escapes and have no visible
representation; serializers SHOULD emit the `\xHH` form for them.

The following named escape sequences are recognized within a string:

| Sequence | Unicode | Description     |
| -------- | ------- | --------------- |
| `\\`     | U+005C  | Reverse solidus |
| `\"`     | U+0022  | Quotation mark  |
| `\0`     | U+0000  | Null            |
| `\a`     | U+0007  | Bell            |
| `\b`     | U+0008  | Backspace       |
| `\t`     | U+0009  | Horizontal tab  |
| `\n`     | U+000A  | Line feed       |
| `\v`     | U+000B  | Vertical tab    |
| `\f`     | U+000C  | Form feed       |
| `\r`     | U+000D  | Carriage return |

In addition, the hex escape `\xHH` (where `HH` is exactly two hexadecimal
digits, `0-9`, `a-f`, or `A-F`) represents the Unicode code point U+0000 through
U+00FF. This provides coverage for control characters that lack named escapes.
For example, `\x01` represents U+0001 and `\x1F` represents U+001F.

`\xHH` denotes a Unicode code point, not a raw byte value; parsing `"\xff"` MUST
produce the same string as the literal character ÿ (U+00FF).

For control characters without a named escape (U+0001–U+0006, U+000E–U+001F),
serializers MUST use the `\xHH` form. Parsers MUST accept both uppercase and
lowercase hex digits.

The following table summarizes the representability of control characters:

| Range         | Named escape      | Hex escape    | Representable  |
| ------------- | ----------------- | ------------- | -------------- |
| U+0000        | `\0`              | `\x00`        | Yes            |
| U+0001–U+0006 | —                 | `\x01`–`\x06` | Yes (hex only) |
| U+0007–U+000D | `\a` through `\r` | `\x07`–`\x0D` | Yes            |
| U+000E–U+001F | —                 | `\x0E`–`\x1F` | Yes (hex only) |

A literal backslash (U+005C) MUST be escaped as `\\`.

A backslash followed by any character not listed in the named escape table above
and not matching the `\xHH` pattern is a parse error. This includes `\uXXXX` and
any other form not explicitly defined. Sawn does not provide `\uXXXX` Unicode
escape sequences; since documents are UTF-8, non-control Unicode characters are
written directly.

### 2.2 Multi-line Strings

A multi-line string is introduced by a key-value pair in which `=` is followed
only by optional trailing whitespace, an optional inline comment (§1.2), and a
line break, and the next non-blank line has at least `(key_depth + 1) × 2`
leading spaces. When an inline comment is present on the trigger line (e.g.
`key= // comment`), the comment is removed first; if the remainder after `=` is
empty (whitespace only), the line introduces a multi-line string. If the next
non-blank line has fewer leading spaces than required, it is a parse error. A
blank line has 0 leading spaces and therefore always terminates rather than
begins a multi-line string.

The _base indentation_ is fixed at `(key_depth + 1) × 2` spaces — always exactly
one level deeper than the key. Unlike other indentation rules, the base
indentation is not determined by the first content line; it is computed from the
key's depth.

The parser collects content lines: all subsequent lines whose leading space
count is at least the base indentation. Characters beyond the base indentation —
including additional spaces — are preserved as content (see §1.4). The string
terminates when any of the following conditions is met:

1. A line whose leading space count is less than the base indentation is
   encountered; that line is not consumed. (A blank line has 0 leading spaces,
   so it always terminates the content block.)
2. End of file (EOF) is reached; the content block ends at EOF. The presence or
   absence of a trailing LF at EOF does not affect the resulting string.

The base indentation is stripped from each collected line. Lines containing only
the base indentation (no characters beyond the stripped prefix) become empty
strings. Content lines are joined with U+000A (LF).

To represent an empty line within a multi-line string, include a line containing
only the base indentation. To produce a trailing line feed, end the content
block with such an indentation-only line.

In the following examples, `·` represents U+0020 (SPACE).

Basic multi-line string:

```
value=
··a
··b
next=1
```

Produces `"a\nb"` for `value`.

Empty line within content (indentation-only line):

```
value=
··a
··
··c
next=1
```

Produces `"a\n\nc"` for `value`. The line containing only `··` (two spaces) is
stripped to an empty string, producing the middle LF.

Trailing line feed:

```
value=
··a
··b
··
next=1
```

Produces `"a\nb\n"` for `value`. The trailing indentation-only line produces a
trailing LF.

Blank line terminates content block:

```
value=
··a
∅
··c
```

The blank line has 0 leading spaces, which is less than the base indentation (2
spaces), so it terminates the content block. `value` produces `"a"`. The
subsequent line `··c` at depth 1 is then an orphaned token with no parent
structure, which is a parse error.

Content beyond the base indentation is preserved as-is:

```
poem=
··roses·are·red
····violets·are·blue
```

Produces `"roses are red\n  violets are blue"` for `poem`. The base indentation
(2 spaces) is stripped from each line. All remaining text on each line —
including any additional leading spaces — is retained as content.

Odd-number leading spaces are valid in content lines. The base indentation
(always even) is stripped, and the remaining spaces are content:

```
code=
···if·(x)·{
···}
```

Produces `" if (x) {\n }"` for `code`. The base indentation is 2 spaces (key at
depth 0), so the third space on each line is preserved as content.

If `=` is followed only by optional trailing whitespace and a line break, and
the next non-blank line does NOT have at least `(key_depth + 1) × 2` leading
spaces, it is a parse error. To represent an empty string, use `key=""`.

Comment processing (§1.2) is NOT applied to collected content lines. Per the
string priority rule (§1.3), `//` within a multi-line string is literal content,
not a comment delimiter.

Multi-line strings MUST NOT appear as table cell values; all table values are
single-line (§3.5).

### 2.3 Numbers

Numbers follow the grammar defined in RFC 8259 §6:

```
number = [ "-" ] int [ frac ] [ exp ]
int    = "0" / ( DIGIT1-9 *DIGIT )
frac   = "." 1*DIGIT
exp    = ( "e" / "E" ) [ "-" / "+" ] 1*DIGIT
```

A number with a leading zero (e.g. `08080`) or an explicit positive sign (e.g.
`+42`) is a parse error.

Implementations MUST support at least the range and precision of IEEE 754
binary64 (double precision). Behavior for numeric values that exceed this range
or precision is implementation-defined.

The token `-0` and its fractional/exponential forms (e.g. `-0.0`, `-0e0`) are
syntactically valid. Implementations SHOULD preserve the sign and treat them as
IEEE 754 negative zero. Whether `-0` and `0` compare as equal is
implementation-defined.

### 2.4 Booleans

The tokens `true` and `false` represent the boolean values true and false.

### 2.5 Null

The token `null` represents the null value.

### 2.6 IEEE 754 Special Values

The tokens `inf`, `-inf`, and `nan` represent positive infinity, negative
infinity, and not-a-number respectively. All forms are lowercase only.

The token `-nan` is not valid; it is a parse error.

### 2.7 Bare Token Resolution

When a bare token appears in value position, it is resolved in the following
order. The first match wins.

1. `true` or `false` → boolean
2. `null` → null
3. `inf`, `-inf`, or `nan` → IEEE 754 special value
4. Matches number grammar (§2.3), including negative numbers → number
5. No match → parse error

The ordering is significant: `-inf` MUST be matched at step 3 before number
parsing at step 4. The token `-inf` is a single indivisible token; it MUST NOT
be decomposed into `-` and `inf`.

### 2.8 Implementation Limits

Implementations SHOULD support at least the following limits. Behavior when
exceeding any of these limits is implementation-defined. Implementations MAY
impose lower limits but MUST document them.

| Resource      | Recommended minimum       |
| ------------- | ------------------------- |
| Nesting depth | 128 levels                |
| String length | 1,048,576 bytes (1 MiB)   |
| Table columns | 1,024                     |
| Table rows    | 1,000,000                 |
| Document size | 67,108,864 bytes (64 MiB) |

Note: The nesting depth limit also affects multi-line strings (§2.2), whose
content lines require indentation of at least `(depth + 1) * 2` spaces. At 128
levels of nesting, a multi-line string's content requires at least 258 leading
spaces per line.

## 3. Structures

All non-scalar data is represented by _structure declarations_. A structure
declaration consists of a key (or no key for anonymous forms) followed by a type
suffix: `{}` for objects, `[]` for arrays, or `[][]` for tables.

Structure suffixes (`{}`, `[]`, `[][]`) MUST be immediately adjacent to the key
with no intervening whitespace. A space between a key and a structure suffix
(e.g. `key {}`) is a parse error (§3.2).

### 3.1 Key-Value Pairs

A key-value pair binds a key to a scalar value. The key and value are separated
by `=` with no intervening whitespace. Whitespace before or after `=` is a parse
error.

```
key=value
```

The value MUST be a scalar as defined in §2.

### 3.2 Keys

A key is a string that identifies a member within an object or a named structure
at root level. Keys appear in two positions: immediately before `=` in key-value
pairs, and before a structure suffix (`{}`, `[]`, `[][]`).

If a key matches the IDENT pattern (§1.7), it MAY be written bare or quoted.
Both forms are equivalent; `name` and `"name"` produce the same key. If a key
does not match IDENT, it MUST be quoted.

All keys are string-typed after parsing, regardless of surface form. Duplicate
key detection uses string comparison: for example, `"-0"` and `"0"` are distinct
keys even though `-0` and `0` are numerically equal. An empty quoted string
(`""`) MUST NOT be used as a key; it is a parse error. This restriction also
applies to table column names (§3.5).

A bare key that is not followed by `=` or a recognized structure suffix (`{}`,
`[]`, `[][]`) is a parse error.

**Reserved word restriction.** Tokens that have value-type meaning — `true`,
`false`, `null`, `inf`, and `nan` — MUST be quoted when used as keys. Although
these tokens match the IDENT pattern, using them bare in key position creates
visual ambiguity with their value semantics. Tokens that do not match IDENT,
such as `-inf` and numeric literals (e.g. `42`, `-1`, `3.14`), MUST also be
quoted when used as keys.

```
"true"=1      // correct
"null"="x"    // correct
"42"="answer" // correct
"-inf"=0      // correct (does not match IDENT)
true=1        // parse error
```

Duplicate keys among the direct members of the same object are a parse error,
regardless of whether the key is quoted or bare. Since `name` and `"name"` are
equivalent (see above), having both in the same object is a duplicate key error.
This rule applies equally to root-level entries: since the implicit root of a
Sawn document is an object (§4), duplicate keys at root level are also a parse
error. Keys in nested objects are independent and do not conflict with ancestor
or sibling object keys. Table column names (§3.5) occupy their own namespace
within the table header and do not conflict with keys of the enclosing object.

### 3.3 Objects (`{}`)

An object is declared by a key immediately followed by `{}`. Members of the
object follow on subsequent lines, each indented one level deeper than the
declaration.

```
config{}
  host="localhost"
  port=8080
```

Members may be key-value pairs, nested objects, arrays, or tables.

A `key{}` declaration with no indented children is a valid empty object.

```
metadata{}
```

**Key ordering.** Implementations MUST preserve the insertion order of keys
within an object. When iterating over an object's members, they MUST be returned
in the order they appear in the source document.

### 3.4 Arrays (`[]`)

An array is declared by a key immediately followed by `[]`. Elements follow on
subsequent lines, one per line, each indented one level deeper than the
declaration.

```
scores[]
  100
  200
  350
```

Array elements may be scalar values, anonymous objects (`{}`), anonymous arrays
(`[]`), or anonymous tables (`[][]`). See §3.6 and §3.7 for details.

A `key[]` declaration with no indented children is a valid empty array.

```
tags[]
```

Each element line within a `[]` array contains exactly one value. The entire
non-whitespace, non-comment content of the line is parsed as a single value per
§2; any text that does not parse as a valid value is a parse error.

### 3.5 Tables (`[][]`)

A table is declared by a key immediately followed by `[][]`, exactly one space
(U+0020), and comma-separated column names. Data rows follow on subsequent
lines, each indented one level deeper than the declaration. Each data row
contains comma-separated values.

```
users[][] name,age,active
  "Alice",30,true
  "Bob",25,false
```

Column names may be quoted (required when the name contains non-IDENT characters
or is a reserved word):

```
scores[][] "player name",score,"is_top?"
  "Alice",100,"true"
  "Bob",85,"false"
```

**Semantic model.** A table produces an array of objects. Each data row is
parsed into an object whose keys are the column names (in declaration order) and
whose values are the corresponding cell values. The table as a whole is an
ordered array of these row-objects. In the example above, `users` produces the
equivalent of:

```
users[]
  {}
    name="Alice"
    age=30
    active=true
  {}
    name="Bob"
    age=25
    active=false
```

Column names that contain commas, spaces, or other characters outside the IDENT
pattern MUST be quoted. Column names that are reserved words (`true`, `false`,
`null`, `inf`, `nan`) MUST also be quoted, consistent with the key quoting rule
(§3.2). A comma within a quoted column name is part of the name, not a
delimiter:

```
data[][] "full,name",age,"home address"
  "Alice Smith",30,"123 Main St"
  "Bob Jones",25,"456 Oak Ave"
```

The following rules apply:

**Header rules:**

- The separator between `[][]` and the first column name MUST be exactly one
  U+0020 (SPACE). Zero spaces, multiple spaces, or any other whitespace
  character in this position is a parse error. Column names that require spaces
  MUST be quoted; spaces within quoted column names are part of the name, not
  separators.
- Column names follow the same rules as keys (§3.2). When column names are
  quoted, the string priority rule applies: tokenize strings before splitting on
  commas (see General rules below).
- Duplicate column names within the same table header are a parse error.
- A table declaration with no column names (e.g. `key[][]` followed by a line
  break) is a parse error. At least one column name is required. A table with
  exactly one column is valid; each data row then contains a single value with
  no commas.

**Data row rules:**

- Each data row MUST contain exactly as many values as there are columns.
- Values within data rows follow §2.
- An empty cell (consecutive commas) is a parse error (e.g. `"Alice",,true`).
  Use `null` or `""` explicitly. An empty quoted string (`""`) is a valid cell
  value (though it MUST NOT be used as a column name; see §3.2).
- Multi-line strings (§2.2) MUST NOT appear in table cells.

**General rules:**

- The parser MUST complete string tokenization of both header and data rows
  before splitting on commas, consistent with the string priority rule (§1.3).
- There MUST be no whitespace around commas in the header or data rows.
  Whitespace adjacent to a comma that is not inside a quoted string is a parse
  error.
- A trailing comma after the last value in a header or data row is a parse
  error.
- A `key[][]` declaration with no data rows is a valid empty array (of objects).
- Tables may appear as children of objects or anonymous objects.
- Inline comments (§1.2) are permitted on both header and data rows. Trailing
  whitespace is handled per the general rule (§1.6). Per the string priority
  rule (§1.3), `//` within a quoted string is not a comment delimiter:

  ```
  urls[][] name,url
    "example","http://example.com"  // the // in the URL is inside a string
  ```

**Key ordering in tables.** A `[][]` table requires all row-objects to share the
same key set in the same order, as declared in the table header. When
serializing an array of objects as a table, all elements MUST have identical key
sets with identical ordering; arrays of objects whose key sets or key orders
differ MUST NOT be serialized as tables.

### 3.6 Anonymous Objects in Arrays

Within a `[]` array, a `{}` on its own line — without a preceding key — declares
an anonymous object. Its members follow on indented lines, using the same rules
as named objects (§3.3).

```
items[]
  {}
    name="Sword"
    damage=50
  {}
    name="Potion"
    effect="heal"
```

A `{}` with no indented children is a valid empty object element.

Scalar values and anonymous objects may be mixed within the same array. More
generally, all element types permitted by `array_child` (§6) — scalar values,
anonymous objects (`{}`), anonymous arrays (`[]`), and anonymous tables (`[][]`)
— may be freely mixed within a single array.

### 3.7 Anonymous Arrays and Tables

A `[]` or `[][]` without a preceding key declares an anonymous array or table.
Anonymous forms are valid at the document root and as elements within a `[]`
array.

At root level:

```
[]
  1
  2
  3
```

Nested within an array:

```
matrix[]
  []
    1
    2
  []
    3
    4
```

```
datasets[]
  [][] name,age
    "Alice",30
    "Bob",25
  [][] name,age
    "Charlie",20
```

An anonymous `[]` with no children is a valid empty array. An anonymous `[][]`
with no data rows is a valid empty array (of objects). All other rules for named
arrays and tables apply.

## 4. Document Structure

A Sawn document MUST contain at least one root-level entry. A root-level entry
is one of: a key-value pair, an object declaration, an array declaration, a
table declaration, or an anonymous array/table.

An anonymous `{}` at root level is a parse error. The implicit root of a Sawn
document is already an object, so an anonymous root object would be redundant.
Anonymous objects are valid only as elements within a `[]` array (§3.6).

Blank lines and comment-only lines are not entries and do not affect document
structure. A document consisting only of blank lines and/or comments (i.e. no
entries) is a parse error.

If the document contains an anonymous root entry, it MUST be the sole root-level
entry; no other entries are permitted at root level. For example, the following
is a parse error because a named entry appears alongside an anonymous root:

```
[]
  1
  2
extra=3  // parse error: anonymous root must be the sole entry
```

Blank lines and comments MAY appear before, after, or alongside the anonymous
root.

When the root contains one or more named entries (key-value pairs or named
structure declarations), the document's value is an object whose members are
those entries. An anonymous root array or table replaces this implicit object
entirely.

## 5. Saws

**Serialized As Written Sheet** (file extension `.saws`, media type
`application/x-saws`)

Saws is a tabular data format defined as a subset of Sawn. It uses a subset of
Sawn's lexical rules and value semantics — specifically those listed below —
without requiring indentation or structure declarations. Parsers and serializers
for Saws MUST be implementable without depending on a full Sawn implementation,
and vice versa.

A Saws document consists of a comma-separated header row followed by zero or
more comma-separated data rows, with no indentation. A Saws document MUST
contain a header row; a document with no header row (empty, or containing only
blank lines and/or comments) is a parse error.

```
name,age,active,score
"Alice",30,true,95.5
"Bob",25,false,inf
"Charlie",null,true,nan
```

A Saws document containing only a header row with no data rows is valid and
represents an empty array (of objects).

**Semantic model.** A Saws document produces an array of objects, where each
data row becomes an object whose keys are the column names and whose values are
the corresponding cell values. This semantic model is identical to that of a
Sawn `[][]` table (§3.5).

**Relationship to Sawn.** Structurally, a Saws document is equivalent to the
body of a single anonymous `[][]` table with no indentation. Any valid Saws
document, when preceded by an anonymous `[][]` declaration and indented by one
level, is a valid Sawn table body. Conversely, a Sawn document whose root is an
anonymous `[][]` table can be converted to a Saws document by removing the
`[][]` declaration line and dedenting all data rows by one level.

Saws shares the following rules with the Sawn specification:

- Encoding: UTF-8, no BOM (§1.1). Implementations SHOULD accept CRLF and
  normalize it to LF before parsing, consistent with §1.1. The presence or
  absence of a trailing LF at end of file does not affect the meaning of the
  final line (§1.1).
- Value semantics: §2 (bare tokens are primitives, quoted tokens are strings).
- String syntax and escape sequences: §2.1.
- Comment syntax: `//` begins a comment; all characters from `//` to end of line
  are ignored. Standalone comment lines are ignored. Inline comments on header
  or data rows MUST be preceded by at least one U+0020 (SPACE); `//` immediately
  adjacent to a value is a parse error. (See §1.2 for the full Sawn comment
  specification.) Example with inline comments on header and data rows:

  ```
  name,"home address",age  // columns
  "Alice","123 Main St",30  // first row
  ```

  The `//` does not conflict with quoted column names because the string
  priority rule applies: commas and spaces within quoted strings are not
  delimiters.
- Blank lines are ignored (§1.5).
- Commas within quoted strings are not delimiters (§1.3, string priority rule;
  §3.5).
- Duplicate column names in the header are a parse error (§3.5).
- An empty quoted string (`""`) as a column name is a parse error (§3.2).
- Each data row MUST contain exactly as many values as there are columns.
- Empty cells (consecutive commas) are a parse error (§3.5).
- There MUST be no whitespace around commas in header or data rows (§3.5).
- A trailing comma after the last value in a header or data row is a parse error
  (§3.5).
- Leading whitespace (indentation) on header or data rows is a parse error. Saws
  documents have no indentation; values requiring leading spaces MUST be quoted
  strings.

## 6. Formal Grammar

The following grammar defines the syntactic structure of a Sawn document using
EBNF notation: `{ ... }` denotes zero or more repetitions, `[ ... ]` denotes an
optional element, and `|` denotes alternatives. Terminal strings are quoted.
Where compact notation is clearer, ABNF-style quantifiers are used (e.g.
`2*U+0020` for "exactly two U+0020 characters"). Whitespace handling,
indentation rules, and comment processing are as specified in §1. Where the
grammar and the prose sections differ in precision (e.g. exact indentation depth
requirements in §2.2), the prose is authoritative.

```
document       = { blank | comment } anonymous_root { blank | comment }
               | { blank | comment } root_entry { blank | comment | root_entry }

anonymous_root = anon_array | anon_table

root_entry     = key_value | object_decl | array_decl | table_decl

key_value      = INDENT key "=" value [ inline_comment ] NEWLINE
               | INDENT key "=" [ inline_comment ] NEWLINE multiline_body
multiline_body = INDENT_CONTENT line { INDENT_CONTENT line }
                 ; terminates when a line has fewer leading spaces than
                 ; INDENT_CONTENT (§2.2)

object_decl    = INDENT key "{}" [ inline_comment ] NEWLINE
                 { child | blank | comment }
array_decl     = INDENT key "[]" [ inline_comment ] NEWLINE
                 { array_child | blank | comment }
table_decl     = INDENT key "[][]" SPACE col_name { "," col_name }
                 [ inline_comment ] NEWLINE
                 { table_row | blank | comment }

anon_object    = INDENT "{}" [ inline_comment ] NEWLINE
                 { child | blank | comment }
anon_array     = INDENT "[]" [ inline_comment ] NEWLINE
                 { array_child | blank | comment }
anon_table     = INDENT "[][]" SPACE col_name { "," col_name }
                 [ inline_comment ] NEWLINE
                 { table_row | blank | comment }

child          = key_value | object_decl | array_decl | table_decl

array_child    = anon_object | anon_array | anon_table
               | INDENT value [ inline_comment ] NEWLINE

table_row      = INDENT value { "," value } [ inline_comment ] NEWLINE

inline_comment = SPACE "//" { any-char }

key            = QUOTED_STRING
               | IDENT  ; excluding RESERVED_WORD
col_name       = QUOTED_STRING
               | IDENT  ; excluding RESERVED_WORD

RESERVED_WORD  = "true" | "false" | "null" | "inf" | "nan"

value          = QUOTED_STRING
               | number | boolean | null_lit
               | inf_lit | nan_lit

number         = [ "-" ] int [ frac ] [ exp ]
int            = "0" | ( DIGIT1_9 { DIGIT } )
frac           = "." DIGIT { DIGIT }
exp            = ( "e" | "E" ) [ "-" | "+" ] DIGIT { DIGIT }
DIGIT          = "0" .. "9"
DIGIT1_9       = "1" .. "9"

boolean        = "true" | "false"
null_lit       = "null"
inf_lit        = "inf" | "-inf"
nan_lit        = "nan"
               ; "-nan" is NOT valid (§2.6).

QUOTED_STRING  = '"' { CHAR | ESCAPE } '"'
CHAR           = <any Unicode code point ≥ U+0020 except U+0022 (") and U+005C (\)>
IDENT          = /[a-zA-Z_][a-zA-Z0-9_]*/
INDENT         = *( 2*U+0020 )  ; zero or more 2-space units; no tabs
INDENT_CONTENT = (parent_depth + 1) * 2*U+0020  ; fixed base indentation for multi-line strings
                 ; matches if line has >= this many leading spaces;
                 ; characters beyond the base indentation are content (§2.2)
line           = { any-char } NEWLINE
SPACE          = U+0020      ; exactly one space; the "exactly one" constraint
                              ; cannot be expressed in EBNF and is enforced by
                              ; prose (§3.5)
NEWLINE        = U+000A      ; line feed (see §1.1 for CRLF normalization)
               | EOF         ; end of file also terminates a line
ESCAPE         = "\\\\" | "\\\"" | "\\0" | "\\a" | "\\b" | "\\t"
               | "\\n" | "\\v" | "\\f" | "\\r"
               | "\\x" HEXDIG HEXDIG
HEXDIG         = "0".."9" | "a".."f" | "A".."F"

comment        = "//" { any-char } NEWLINE
blank          = [ whitespace ] NEWLINE
```

## 7. Rationale

This section is non-normative.

### 7.1 Why not JSON?

JSON is universally supported but carries significant structural overhead:
quoted keys, repeated key names in arrays of objects, brackets, colons, and
commas. In contexts where token budgets matter — such as LLM prompts — this
overhead is pure waste. Sawn eliminates it through indentation-based nesting and
tabular notation.

### 7.2 Why not YAML?

YAML offers flexibility at the cost of complexity. Its specification exceeds 80
pages, no two implementations fully agree, and implicit type coercion creates
real-world bugs (the "Norway problem", where the country code `NO` is silently
coerced to boolean `false`). Sawn takes the opposite approach: one way to write
each structure, explicit type suffixes, and a specification that fits in a few
pages.

### 7.3 Design Decisions

**`//` comment syntax.** The `//` line comment style is used by C, C++, Java,
JavaScript, TypeScript, Go, Rust, Swift, Kotlin, and many other languages that
dominate LLM training corpora. This makes `//` by far the most frequently
occurring comment delimiter in training data, and therefore the most reliably
generated form. Alternatives such as `#` (Python, Ruby, shell) or `--` (SQL,
Lua, Haskell) are common in specific ecosystems but have lower aggregate
frequency across the broad set of languages seen during pretraining.

**Explicit structure suffixes (`{}`, `[]`, `[][]`).** Every structure is
declared with a suffix. There is no ambiguity between an object, array, or
scalar — the parser knows the type before reading any children.

**All strings quoted.** Bare tokens are always primitives. This eliminates an
entire class of type-coercion bugs at the cost of a few extra tokens. Tokenizers
trained on JSON and programming languages handle quoted strings efficiently, so
the overhead is smaller than it appears.

**2-space indentation only.** A single canonical indentation width eliminates
style debates and ensures consistent token costs. 2 spaces is the most common
indentation width in LLM training data (JavaScript, YAML, JSON formatting),
making it the most reliably generated width.

**Comma-delimited tables.** The `[][]` tabular notation uses commas as value
delimiters. Although the syntax is superficially reminiscent of CSV, Sawn tables
differ significantly: values are typed (not all strings), whitespace around
commas is forbidden, empty cells are not permitted, and quoting rules follow
Sawn string semantics rather than RFC 4180. The tabular subset is independently
usable as Saws (§5).

**No inline/flow syntax.** There is no `{a: 1}` or `[1, 2]`. Structure is always
expressed through indentation. This guarantees that every Sawn document has a
single visual form.

**No whitespace around `=`.** Key-value pairs use `key=value` with no spaces
around `=`. This is consistent with the adjacency rule for structure suffixes
(`key{}`, `key[]`, `key[][]`), giving all key-bound syntax a uniform visual
style. It also simplifies multi-line string detection: `key=` followed by a line
break unambiguously introduces a multi-line string, with no need to parse an
intervening space. The separator between `[][]` and its column names is exactly
one space; this is a fixed delimiter rather than optional whitespace, consistent
with the table's comma-delimited data rows where whitespace is significant.

**Reserved word keys require quoting.** Value-type keywords (`true`, `null`,
`inf`, etc.) must be quoted when used as keys. Although the parser can
distinguish key position from value position syntactically, bare reserved words
in key position create visual ambiguity for human readers. Requiring quotes for
these tokens eliminates a class of readability errors at the cost of a few extra
characters — a trade-off consistent with Sawn's overall philosophy of
explicitness over cleverness.

**Escape sequences: why `\xHH` instead of `\uXXXX`.** Sawn provides C-language
named escapes (`\n`, `\t`, etc.) plus `\\` and `\"`, supplemented by `\xHH` for
Unicode code points in the U+0000–U+00FF range. The `\xHH` form ensures all
control characters are representable, including those without named escapes
(U+0001–U+0006, U+000E–U+001F). Sawn does not provide `\uXXXX`. UTF-8 encoding
makes Unicode escapes unnecessary for non-control characters. Furthermore,
`\uXXXX` in JSON is limited to a single UTF-16 code unit, which requires
surrogate pairs (`\uD800`–`\uDFFF`) for characters outside the Basic
Multilingual Plane. Surrogate pair handling is a well-documented source of
implementation bugs — unpaired surrogates, reversed pairs, and double-encoding
errors are common across JSON libraries. By requiring direct UTF-8 encoding and
providing `\xHH` for the control character range, Sawn eliminates this entire
class of bugs while maintaining full representability.

**Escape sequences: why limit `\xHH` to U+00FF.** The `\xHH` range is
intentionally limited to U+00FF: its primary purpose is to cover C0 control
characters (U+0000–U+001F), which are forbidden as literals in strings. The
range also covers C1 control characters (U+0080–U+009F), which SHOULD NOT appear
as literals (§2.1). `\xHH` is not intended as a general Unicode escape
mechanism. Characters above U+00FF — including invisible characters such as
zero-width spaces (U+200B) or direction overrides (U+202A–U+202E) — are written
as literal UTF-8. Detection of misleading invisible characters is a concern for
linters and editors, not the serialization format.

**Empty document is a parse error.** A Sawn document MUST contain at least one
root-level entry. Treating empty documents as valid (e.g. producing an empty
object) would silently accept corrupted or truncated files. Requiring explicit
content — even a single `key=value` or an empty named structure like `data{}` —
ensures that every valid document expresses an intentional value.

**IEEE 754 binary64 numeric precision.** Requiring at least double precision
ensures interoperability without preventing higher-precision implementations.

**`-nan` is not valid.** Although IEEE 754 NaN values carry a sign bit, nearly
all programming languages and serialization formats treat NaN as unsigned. No
mainstream language distinguishes `-NaN` from `NaN`. Allowing `-nan` would
create a syntactic distinction with no practical semantic difference, adding
complexity for no benefit.

**Nesting depth limit.** A recommended maximum of 128 levels balances practical
use cases against resource exhaustion attacks from deeply nested input.

### 7.4 Relationship to JSON

Sawn is not a superset or subset of JSON. It is a distinct format with its own
syntax. However, most Sawn documents can be mechanically converted to JSON and
vice versa. See Appendix A for conversion guidelines.

## Appendix A. JSON Conversion Guide (Informative)

This appendix is non-normative. It provides recommended practices for converting
between Sawn and JSON.

### A.1 Sawn to JSON

The following mappings are RECOMMENDED for Sawn types not present in JSON:

| Sawn   | JSON   |
| ------ | ------ |
| `inf`  | `null` |
| `-inf` | `null` |
| `nan`  | `null` |

All other types map to their JSON equivalents without transformation.

Note: The numeric value `-0` is valid in both Sawn and JSON, but many JSON
serializers emit `0` for negative zero (e.g. JavaScript's `JSON.stringify(-0)`
produces `"0"`). Converters SHOULD be aware that the sign of zero may not
survive a round-trip through JSON.

Note: The values `inf`, `-inf`, and `nan` have no direct JSON equivalents.
Mapping them all to `null` results in information loss: the distinction between
`null` and the IEEE 754 special values is not preserved in the JSON output.
Converters SHOULD document this lossy mapping. This specification intentionally
does not define alternative mappings (such as string representations); the
`null` mapping above is the sole RECOMMENDED conversion. Applications that
require lossless round-tripping of these values should use Sawn natively rather
than converting through JSON.

### A.2 JSON to Sawn

Most JSON documents can be represented as Sawn documents. The following
conversion steps are RECOMMENDED:

- JSON `\uXXXX` escape sequences SHOULD be decoded to their Unicode code points
  and written directly as UTF-8 characters in the Sawn output.
- JSON strings containing control characters U+0001–U+0006 or U+000E–U+001F
  SHOULD be converted using the `\xHH` escape form in the Sawn output.
- A root-level JSON array uses an anonymous `[]` or `[][]`.
- Arrays nested within arrays use anonymous `[]` or `[][]`.
- Arrays of objects with identical key sets in identical order SHOULD be emitted
  as `[][]` tables. The column order matches the key order of the objects.
- Arrays of objects with differing key sets use anonymous `{}` elements.
- Object keys that do not match IDENT MUST be quoted.
- All other values map directly.

---

_Sawn v1.0 — March 2026_
