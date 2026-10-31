/** `path:10` for one line; `path:L10-L20` for a range, the format agents and GitHub links share. */
export function formatPathLineReference(
  filePath: string,
  { line, endLine }: { line: number; endLine?: number }
): string {
  return endLine !== undefined && endLine > line
    ? `${filePath}:L${line}-L${endLine}`
    : `${filePath}:${line}`
}
