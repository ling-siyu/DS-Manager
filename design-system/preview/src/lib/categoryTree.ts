import type { PreviewComponent } from '../types';

// A nested category tree built from components' '/'-delimited category paths.
// Each node's `count` is the number of components in its whole subtree.

export interface CatNode {
  name: string;   // this segment's label
  path: string;   // full category path, e.g. "Landing/Illustrations"
  count: number;  // components in this subtree
  children: CatNode[];
}

export function buildCategoryTree(components: PreviewComponent[]): CatNode[] {
  const byPath = new Map<string, CatNode>();
  const roots: CatNode[] = [];

  for (const c of components) {
    const segs = (c.category || 'Uncategorized').split('/');
    let acc = '';
    let siblings = roots;
    for (const seg of segs) {
      acc = acc ? `${acc}/${seg}` : seg;
      let node = byPath.get(acc);
      if (!node) {
        node = { name: seg, path: acc, count: 0, children: [] };
        byPath.set(acc, node);
        siblings.push(node);
      }
      node.count += 1;
      siblings = node.children;
    }
  }

  const sortRec = (nodes: CatNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** A component's category matches the selection when it equals it or is nested
 *  under it. `null` selection matches everything. */
export function matchesCategory(category: string, selected: string | null): boolean {
  if (!selected) return true;
  return category === selected || category.startsWith(`${selected}/`);
}
