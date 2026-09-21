import { describe, expect, it } from 'vitest';
import { buildTree, type TreeNode } from './build-tree.js';

describe('buildTree', () => {
  const nodes = (rows: Array<[string, string | null, number]>): TreeNode[] =>
    rows.map(([id, parentId, sort]) => ({ id, parentId, sort }));

  it('nests by parentId and sorts by sort then id', () => {
    const tree = buildTree(
      nodes([
        ['d', 'a', 0],
        ['a', null, 1],
        ['b', null, 0],
        ['c', 'a', 0],
      ]),
    );
    expect(tree.map((n) => n.id)).toEqual(['b', 'a']);
    expect(tree[1].children?.map((n: TreeNode) => n.id)).toEqual(['c', 'd']);
  });

  it('drops orphans whose parent is not in the set', () => {
    const tree = buildTree(nodes([['a', 'missing', 0]]));
    expect(tree).toEqual([]);
  });
});
