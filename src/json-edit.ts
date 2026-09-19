// Positional JSON edits that leave every untouched byte alone, so a registry pull request shows
// only the change. The scanner maps each value to its span in the source text.
export interface Span {start: number; end: number; type: 'object' | 'array' | 'scalar'; children: Map<string | number, Span>}
export function scanJson(text: string): Span {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const string = () => { const s = i; i++; while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; return text.slice(s + 1, i - 1); };
  const value = (): Span => {
    ws(); const start = i;
    if (text[i] === '{') {
      const children = new Map<string, Span>(); i++; ws();
      while (text[i] !== '}') { ws(); const key = JSON.parse(`"${string()}"`); ws(); i++; const v = value(); children.set(key, v); ws(); if (text[i] === ',') i++; ws(); }
      i++; return {start, end: i, type: 'object', children};
    }
    if (text[i] === '[') {
      const children = new Map<number, Span>(); i++; ws(); let n = 0;
      while (text[i] !== ']') { children.set(n++, value()); ws(); if (text[i] === ',') i++; ws(); }
      i++; return {start, end: i, type: 'array', children};
    }
    if (text[i] === '"') { string(); return {start, end: i, type: 'scalar', children: new Map()}; }
    while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
    return {start, end: i, type: 'scalar', children: new Map()};
  };
  return value();
}
export function spanAt(root: Span, keys: (string | number)[]): Span | undefined {
  let s: Span | undefined = root;
  for (const k of keys) { s = s?.children.get(k); if (!s) return undefined; }
  return s;
}
// Append `entry` (already serialized, single line or multi-line) to the object or array at `keys`.
// Single-line containers stay single-line; multi-line containers get a new line in their indentation.
export function appendToContainer(text: string, keys: (string | number)[], entry: string): string | undefined {
  const container = spanAt(scanJson(text), keys);
  if (!container || container.type === 'scalar') return undefined;
  const inner = text.slice(container.start + 1, container.end - 1);
  const last = [...container.children.values()].pop();
  const closing = container.end - 1;
  if (!last) {
    const multi = inner.includes('\n');
    const indent = multi ? lineIndent(text, container.start) + detectStep(text) : '';
    return text.slice(0, container.start + 1) + (multi ? `\n${indent}${reindent(entry, indent)}\n${lineIndent(text, container.start)}` : ` ${entry} `) + text.slice(closing);
  }
  const between = text.slice(last.end, closing);
  if (!between.includes('\n')) return text.slice(0, last.end) + `, ${entry}` + text.slice(last.end);
  const indent = lineIndent(text, lastKeyStart(text, last));
  return text.slice(0, last.end) + `,\n${indent}${reindent(entry, indent)}` + text.slice(last.end);
}
function lastKeyStart(text: string, valueSpan: Span) {
  // For object members the line starts at the key; walk back to the line start from the value.
  let i = valueSpan.start; while (i > 0 && text[i - 1] !== '\n') i--; return i;
}
function lineIndent(text: string, pos: number) { let i = pos; while (i > 0 && text[i - 1] !== '\n') i--; return /^[ \t]*/.exec(text.slice(i))![0]; }
export function detectStep(text: string) { return /\n([ \t]+)"/.exec(text)?.[1] ?? '  '; }
function reindent(entry: string, indent: string) { return entry.split('\n').map((l, n) => n === 0 ? l : indent + l).join('\n'); }
