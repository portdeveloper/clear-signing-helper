import fs from 'node:fs';
import path from 'node:path';
import type { EnumLeaf } from './ast.js';

// Address mode has no AST, but it has two proofs of an enum: the verified ABI names the Solidity type of an
// enum argument in `internalType` ("enum Pausable.FunctionFlag"), and the verified source saved by
// init --address defines it. A leaf becomes an enum only when both agree: the type is found in the source
// under the scope the ABI names, and every definition found for it lists the same members. Two different
// definitions of one name are not resolved by guessing; the leaf then stays raw.
export interface EnumDefinition { scope: string | undefined; name: string; members: string[] }

// Comments and string literals removed, so braces and keywords inside them are not read as code.
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, m => m.startsWith('/') ? ' ' : '""');
}
export function enumDefinitions(source: string): EnumDefinition[] {
  const text = code(source), out: EnumDefinition[] = [];
  const token = /\b(?:contract|library|interface)\s+([A-Za-z_$][\w$]*)[^{;]*\{|\benum\s+([A-Za-z_$][\w$]*)\s*\{([^{}]*)\}|[{}]/g;
  let depth = 0, scope: {name: string; depth: number} | undefined;
  for (let m = token.exec(text); m; m = token.exec(text)) {
    if (m[1]) { depth++; if (!scope) scope = {name: m[1], depth}; }
    else if (m[2]) { const members = m[3].split(',').map(x => x.trim()).filter(Boolean); if (members.length && members.every(x => /^[A-Za-z_$][\w$]*$/.test(x))) out.push({scope: scope?.name, name: m[2], members}); }
    else if (m[0] === '{') depth++;
    else { if (scope && depth === scope.depth) scope = undefined; depth = Math.max(0, depth - 1); }
  }
  return out;
}
function solidityFiles(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 32 || out.length > 5000) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) solidityFiles(file, out, depth + 1);
    else if (e.isFile() && e.name.endsWith('.sol') && fs.statSync(file).size <= 4 * 1024 * 1024) out.push(file);
  }
  return out;
}
// Enum-typed leaves of one function's ABI inputs, named the way descriptors.leaves() names them.
export function enumLeavesFromAbi(inputs: readonly any[], definitions: EnumDefinition[]): EnumLeaf[] {
  const out: EnumLeaf[] = [];
  const walk = (p: any, at: string, type: string, internal: string, depth: number) => {
    if (depth > 32) return;
    const array = /^(.*)\[\d*\]$/.exec(type);
    if (array) return walk(p, `${at}.[]`, array[1], internal.replace(/\[\d*\]$/, ''), depth + 1);
    if (type === 'tuple') { (p.components ?? []).forEach((c: any, i: number) => walk(c, `${at}.${c.name || `arg${i}`}`, String(c.type), String(c.internalType ?? ''), depth + 1)); return; }
    const named = /^enum ((?:[A-Za-z_$][\w$]*\.)?)([A-Za-z_$][\w$]*)$/.exec(internal);
    if (!named || type !== 'uint8') return;
    const scope = named[1] ? named[1].slice(0, -1) : undefined;
    const found = definitions.filter(d => d.name === named[2] && d.scope === scope);
    if (!found.length || found.some(d => d.members.join(',') !== found[0].members.join(','))) return;
    out.push({path: at, canonicalName: scope ? `${scope}.${named[2]}` : named[2], members: found[0].members, kind: 'verified'});
  };
  inputs.forEach((p, i) => walk(p, p.name || `arg${i}`, String(p.type), String(p.internalType ?? ''), 0));
  return out;
}
export function definitionsIn(dir: string): EnumDefinition[] {
  if (!fs.existsSync(dir)) return [];
  return solidityFiles(dir).flatMap(file => enumDefinitions(fs.readFileSync(file, 'utf8')));
}
