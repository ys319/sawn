/** Sawn parse/serialize error with line information. */
export class SawnError extends Error {
  override readonly name = "SawnError";
  constructor(
    message: string,
    public readonly line: number,
    public readonly column?: number,
  ) {
    super(
      `${message} (line ${line}${
        column !== undefined ? `, col ${column}` : ""
      })`,
    );
  }
}
