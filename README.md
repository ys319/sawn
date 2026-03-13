# Sawn

**Serialized As Written Notation**

A human-readable data serialization format. Prioritizes clarity and correctness
over brevity — designed for LLM workflows where both humans and models read and
write structured data.

```
version=1
format="sawn"

users[][] name,age,active
  "Alice",30,true
  "Bob",25,false

config{}
  host="localhost"
  port=8080
  tags[]
    "fast"
    "reliable"
  middleware[]
```

## Goals

- **LLM-friendly** — easier to read and write than JSON, for both humans and
  models
- **Simple spec** — avoid YAML-level complexity; minimize the learning curve
- **What you write is what you get** — no type coercion surprises; bare tokens
  are parsed by strict syntax rules, so values come back exactly as written

### Non-Goals

- Token efficiency is a design consideration, not the ultimate goal. Where
  efficiency conflicts with correctness or clarity, correctness wins.

## Install

Available on [JSR](https://jsr.io/@ys319/sawn):

```bash
deno add jsr:@ys319/sawn
pnpm add jsr:@ys319/sawn
npx jsr add @ys319/sawn
bunx jsr add @ys319/sawn
```

## Usage

### Parse (Sawn → JS)

```ts
import { parse } from "@ys319/sawn";

const data = parse(`
name="Luke Skywalker"
height=172
jedi=true
`);
// { name: "Luke Skywalker", height: 172, jedi: true }
```

### Stringify (JS → Sawn)

```ts
import { stringify } from "@ys319/sawn";

const sawn = stringify({
  users: [
    { name: "Alice", age: 30, active: true },
    { name: "Bob", age: 25, active: false },
  ],
});
// users[][] name,age,active
//   "Alice",30,true
//   "Bob",25,false
```

Homogeneous object arrays are automatically emitted as tables (`[][]`).

## API

### `parse(input: string, options?: ParseOptions): SawnObject | SawnArray`

Parse a Sawn document into a JavaScript value.

**Options:**

- `specialNumberHandling`: `"preserve"` (default) | `"null"` | `"string"`

### `stringify(value: SawnObject | SawnArray, options?: StringifyOptions): string`

Stringify a JavaScript value to Sawn format.

**Options:**

- `tableThreshold`: Minimum row count to use table syntax (default: `1`)

### `SawnError`

Custom error class with `line` and optional `column` properties.

## Why Sawn?

| Feature         | JSON        | YAML               | Sawn                        |
| --------------- | ----------- | ------------------ | --------------------------- |
| String syntax   | 1 way       | 5+ ways            | 2 ways (quoted + multiline) |
| Array syntax    | 1 way       | 2–3 ways           | 1 way                       |
| Type ambiguity  | None        | Yes (`NO` → false) | None                        |
| Tabular data    | Repeat keys | Repeat keys        | Table syntax                |
| Anchors/aliases | —           | Yes                | No                          |
| Custom tags     | —           | Yes                | No                          |
| Flow syntax     | Only        | Yes                | No                          |

## LLM Integration

### Reading Sawn

LLMs can read Sawn without any special prompting. The syntax is close enough to
familiar formats (indentation-based nesting, `key=value`, `//` comments) that
models parse it correctly out of the box. If a model struggles with less common
constructs (tables, multi-line strings), include the guide file below.

### Writing Sawn

To have an LLM generate Sawn output, include
[`refs/sawn-guide-for-llms.sawn`](refs/sawn-guide-for-llms.sawn) in the prompt
context. This single file covers the full syntax through annotated examples — no
separate spec reading required.

## Docs

- [Specification](docs/spec.md)

## License

MIT
