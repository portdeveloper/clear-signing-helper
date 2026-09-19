// Read-only view over solc ASTs emitted by `forge build --ast`. Node ids are unique across one
// compilation, so a single id map spans every artifact of the build.
export interface AstIndex { nodes: Map<number, any>; contracts: any[] }
export interface EnumLeaf { path: string; canonicalName: string; members: string[] }
export interface ConstructorBinding { name: string; paramIndex: number; typeString: string }
export interface AddressConstant { name: string; value: string }

export function indexAsts(units: any[]): AstIndex {
  const nodes = new Map<number, any>(), contracts: any[] = [], seen = new Set<string>();
  const visit = (n: any, depth: number) => {
    if (depth > 512 || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const v of n) visit(v, depth + 1); return; }
    if (typeof n.id === 'number' && typeof n.nodeType === 'string') { nodes.set(n.id, n); if (n.nodeType === 'ContractDefinition') contracts.push(n); }
    for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  for (const unit of units) {
    if (!unit || typeof unit.absolutePath !== 'string' || seen.has(unit.absolutePath)) continue;
    seen.add(unit.absolutePath); visit(unit, 0);
  }
  return {nodes, contracts};
}
export function findContract(index: AstIndex, source: string, name: string) {
  return index.contracts.find(c => c.name === name && sourceUnitOf(index, c) === source);
}
function sourceUnitOf(index: AstIndex, node: any): string | undefined {
  const unit = index.nodes.get(node.scope);
  return unit?.nodeType === 'SourceUnit' ? unit.absolutePath : undefined;
}
// The most derived definition of the external function with this selector, following C3 order.
export function findFunction(index: AstIndex, contract: any, selector: string) {
  const wanted = selector.replace(/^0x/, '').toLowerCase();
  for (const id of contract.linearizedBaseContracts ?? [contract.id]) {
    const base = index.nodes.get(id);
    for (const n of base?.nodes ?? []) if (n.nodeType === 'FunctionDefinition' && typeof n.functionSelector === 'string' && n.functionSelector.toLowerCase() === wanted) return n;
  }
  return undefined;
}
// Leaf paths whose declared Solidity type is an enum, named the way descriptors.leaves() names them.
export function enumLeaves(index: AstIndex, fn: any): EnumLeaf[] {
  const out: EnumLeaf[] = [];
  const walk = (typeName: any, path: string, depth: number) => {
    if (!typeName || depth > 32) return;
    if (typeName.nodeType === 'ArrayTypeName') return walk(typeName.baseType, `${path}.[]`, depth + 1);
    if (typeName.nodeType !== 'UserDefinedTypeName') return;
    const decl = index.nodes.get(typeName.referencedDeclaration ?? typeName.pathNode?.referencedDeclaration);
    if (!decl) return;
    if (decl.nodeType === 'EnumDefinition') out.push({path, canonicalName: decl.canonicalName ?? decl.name, members: (decl.members ?? []).map((m: any) => m.name)});
    else if (decl.nodeType === 'StructDefinition') for (const m of decl.members ?? []) walk(m.typeName, `${path}.${m.name}`, depth + 1);
  };
  (fn?.parameters?.parameters ?? []).forEach((p: any, i: number) => walk(p.typeName, p.name || `arg${i}`, 0));
  return out;
}
// Immutable state variables assigned directly from a constructor parameter, optionally through a type
// conversion such as IERC20(param). Only this contract's own constructor is inspected.
export function constructorBindings(index: AstIndex, contract: any): ConstructorBinding[] {
  const ctor = (contract.nodes ?? []).find((n: any) => n.nodeType === 'FunctionDefinition' && n.kind === 'constructor');
  if (!ctor?.body) return [];
  const params: any[] = ctor.parameters?.parameters ?? [];
  const paramIndex = new Map<number, number>(params.map((p, i) => [p.id, i]));
  const out: ConstructorBinding[] = [];
  const unwrap = (e: any): any => e?.nodeType === 'FunctionCall' && e.kind === 'typeConversion' && e.arguments?.length === 1 ? unwrap(e.arguments[0]) : e;
  const visit = (n: any, depth: number) => {
    if (!n || typeof n !== 'object' || depth > 64) return;
    if (Array.isArray(n)) { for (const v of n) visit(v, depth + 1); return; }
    if (n.nodeType === 'Assignment' && n.operator === '=' && n.leftHandSide?.nodeType === 'Identifier') {
      const target = index.nodes.get(n.leftHandSide.referencedDeclaration);
      const rhs = unwrap(n.rightHandSide);
      if (target?.nodeType === 'VariableDeclaration' && target.stateVariable && target.mutability === 'immutable' && rhs?.nodeType === 'Identifier' && paramIndex.has(rhs.referencedDeclaration)) {
        out.push({name: target.name, paramIndex: paramIndex.get(rhs.referencedDeclaration)!, typeString: target.typeDescriptions?.typeString ?? ''});
      }
    }
    for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  visit(ctor.body, 0);
  return out;
}
// Constant state variables initialised with a literal address, in this contract or its bases.
export function addressConstants(index: AstIndex, contract: any): AddressConstant[] {
  const out: AddressConstant[] = [];
  for (const id of contract.linearizedBaseContracts ?? [contract.id]) {
    for (const n of index.nodes.get(id)?.nodes ?? []) {
      if (n.nodeType !== 'VariableDeclaration' || !n.stateVariable || n.mutability !== 'constant') continue;
      let v = n.value;
      if (v?.nodeType === 'FunctionCall' && v.kind === 'typeConversion' && v.arguments?.length === 1) v = v.arguments[0];
      if (v?.nodeType === 'Literal' && v.kind === 'number' && /^0x[0-9a-fA-F]{40}$/.test(v.value ?? '')) out.push({name: n.name, value: v.value});
    }
  }
  return out;
}
