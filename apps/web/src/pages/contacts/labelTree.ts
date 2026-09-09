import type { ContactLabel } from '../../shells/contacts-context.js';

export interface LabelNode {
  label: ContactLabel;
  depth: number;
  children: LabelNode[];
}

// Build a forest from the flat label list. A label whose parent_id points
// at a label that doesn't exist (deleted mid-session, or filtered out) is
// treated as a root so it never just vanishes from the sidebar.
export function buildLabelForest(labels: ContactLabel[]): LabelNode[] {
  const byId = new Map(labels.map(l => [l.id, l]));
  const childrenOf = new Map<string | null, ContactLabel[]>();
  for (const l of labels) {
    const key = l.parent_id && byId.has(l.parent_id) ? l.parent_id : null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(l);
    childrenOf.set(key, arr);
  }
  const sortByName = (a: ContactLabel, b: ContactLabel) => a.name.localeCompare(b.name);
  const build = (parentId: string | null, depth: number): LabelNode[] =>
    (childrenOf.get(parentId) ?? [])
      .slice()
      .sort(sortByName)
      .map(label => ({ label, depth, children: build(label.id, depth + 1) }));
  return build(null, 0);
}

// id -> Set of that id plus every id beneath it. Used to make "show me
// everyone under Clients" include VIP, Prospects, etc.
export function labelDescendantMap(labels: ContactLabel[]): Map<string, Set<string>> {
  const byId = new Map(labels.map(l => [l.id, l]));
  const childrenOf = new Map<string, string[]>();
  for (const l of labels) {
    if (!l.parent_id || !byId.has(l.parent_id)) continue;
    const arr = childrenOf.get(l.parent_id) ?? [];
    arr.push(l.id);
    childrenOf.set(l.parent_id, arr);
  }
  const collect = (id: string, acc: Set<string>) => {
    acc.add(id);
    for (const c of childrenOf.get(id) ?? []) collect(c, acc);
    return acc;
  };
  return new Map(labels.map(l => [l.id, collect(l.id, new Set())]));
}

// Every label that would create a cycle if chosen as `labelId`'s parent:
// the label itself and all of its descendants.
export function invalidParentIds(labels: ContactLabel[], labelId: string): Set<string> {
  return labelDescendantMap(labels).get(labelId) ?? new Set([labelId]);
}

export function flattenForest(nodes: LabelNode[]): LabelNode[] {
  const out: LabelNode[] = [];
  const walk = (list: LabelNode[]) => {
    for (const n of list) { out.push(n); walk(n.children); }
  };
  walk(nodes);
  return out;
}
