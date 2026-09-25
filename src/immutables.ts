import { getAddress } from 'ethers';

// Named address immutables of a Sourcify-verified contract, from the verified record alone. Sourcify
// returns each immutable's value (transformationValues.immutables, keyed by AST id) and where the
// bytecode reads it (immutableReferences), but no AST to name it. The runtime source map names it:
// every reference maps to a range of verified source, which is the variable's declaration (in its
// public getter) or its identifier (where a function reads it). An id is named only when every
// reference agrees, its value is a nonzero address, and the ABI has its public getter, so a reviewer
// can read the same value from an explorer.
export interface NamedImmutable {name: string; address: string}
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
// The identifier a reference's source text names: itself, or the variable its declaration declares.
function nameIn(text: string): string | undefined {
  const t = text.trim().replace(/;$/, '');
  if (IDENT.test(t)) return t;
  if (!/\bimmutable\b/.test(t)) return undefined;
  const declared = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(t.split('=')[0].trim())?.[1];
  return declared && declared !== 'immutable' ? declared : undefined;
}
export function namedImmutables(body: any, abi: any[]): NamedImmutable[] {
  const rb = body?.runtimeBytecode, values = rb?.transformationValues?.immutables, refs = rb?.immutableReferences;
  const sources = body?.sources, units = body?.stdJsonOutput?.sources;
  const code = typeof rb?.recompiledBytecode === 'string' ? rb.recompiledBytecode : rb?.onchainBytecode;
  if (!values || !refs || !sources || !units || typeof rb?.sourceMap !== 'string' || typeof code !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(code)) return [];
  const bytes = Buffer.from(code.slice(2), 'hex');
  // Instruction index of each opcode's byte offset; PUSH1..PUSH32 carry 1..32 immediate bytes.
  const instruction = new Map<number, number>();
  for (let i = 0, n = 0; i < bytes.length; n++) { instruction.set(i, n); const op = bytes[i]; i += 1 + (op >= 0x60 && op <= 0x7f ? op - 0x5f : 0); }
  // Compressed source map: s:l:f:j:m per instruction, an empty field repeats the previous entry's.
  const entries: [number, number, number][] = [];
  let prev = ['0', '0', '-1'];
  for (const e of rb.sourceMap.split(';')) { const p = e.split(':'); prev = [0, 1, 2].map(k => p[k] ? p[k] : prev[k]); entries.push([Number(prev[0]), Number(prev[1]), Number(prev[2])]); }
  const fileById = new Map<number, string>(Object.entries<any>(units).map(([file, u]) => [u?.id, file]));
  const getters = new Set(abi.filter((f: any) => f?.type === 'function' && !f.inputs?.length && f.outputs?.length === 1 && f.outputs[0].type === 'address' && ['view', 'pure'].includes(f.stateMutability)).map((f: any) => f.name));
  const found: NamedImmutable[] = [];
  for (const [id, list] of Object.entries<any>(refs)) {
    const value = values[id];
    if (typeof value !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(value) || /^0x0{64}$/.test(value) || !Array.isArray(list) || !list.length) continue;
    const names = new Set<string | undefined>();
    for (const r of list) {
      // The reference is the 32-byte immediate of a PUSH32 whose opcode sits one byte earlier.
      const entry = entries[instruction.get(r?.start - 1) ?? -1], file = entry && fileById.get(entry[2]);
      const content = file && sources[file]?.content;
      names.add(typeof content === 'string' ? nameIn(Buffer.from(content, 'utf8').subarray(entry[0], entry[0] + entry[1]).toString('utf8')) : undefined);
    }
    const [name] = [...names];
    if (names.size === 1 && name && getters.has(name)) found.push({name, address: getAddress('0x' + value.slice(-40))});
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
