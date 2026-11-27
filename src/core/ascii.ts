/**
 * Parses ASCII maps: strips blank leading/trailing lines and common
 * indentation (so maps can live in indented template strings), and pads
 * rows to a rectangle with spaces.
 */
export interface AsciiMap {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export function parseAscii(text: string): AsciiMap {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift();
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  if (lines.length === 0) throw new Error('ASCII map is empty');

  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const lead = line.length - line.trimStart().length;
    indent = Math.min(indent, lead);
  }
  const trimmed = lines.map((l) => l.slice(indent).replace(/\s+$/, ''));
  const width = Math.max(...trimmed.map((l) => l.length));
  return { width, height: trimmed.length, rows: trimmed.map((l) => l.padEnd(width, ' ')) };
}
