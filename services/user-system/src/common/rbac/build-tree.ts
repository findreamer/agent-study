export interface TreeNode {
  id: string;
  parentId: string | null;
  sort: number;
  children?: TreeNode[];
}

/**
 * Attach children to flat nodes in memory. Nodes whose parent is missing from
 * the input set (orphans) are dropped. Input order is irrelevant; children are
 * sorted by sort then id.
 */
export function buildTree<T extends TreeNode>(flat: T[]): T[] {
  const byId = new Map<string, T>();
  for (const node of flat) {
    byId.set(node.id, { ...node, children: [] as T[] });
  }

  const roots: T[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!;
      (parent.children as T[]).push(node);
    } else if (!node.parentId) {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: T[]): void => {
    nodes.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    nodes.forEach((n) => sortNodes((n.children as T[]) ?? []));
  };
  sortNodes(roots);
  return roots;
}
