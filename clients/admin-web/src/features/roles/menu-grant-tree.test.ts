import { describe, expect, it } from 'vitest';
import type { MenuNode } from '@agent-study/contracts';
import { collectIds, computeTreeState, toggleNodeInSet } from './menu-grant-tree';

const tree: MenuNode[] = [
  {
    id: 'd1',
    parentId: null,
    type: 'DIR',
    name: '系统管理',
    visible: true,
    status: 'ENABLED',
    sort: 0,
    children: [
      {
        id: 'm1',
        parentId: 'd1',
        type: 'MENU',
        name: '用户管理',
        path: '/users',
        visible: true,
        status: 'ENABLED',
        sort: 0,
        children: [
          {
            id: 'b1',
            parentId: 'm1',
            type: 'BUTTON',
            name: '新建',
            permissionCode: 'user:create',
            visible: true,
            status: 'ENABLED',
            sort: 0,
          },
          {
            id: 'b2',
            parentId: 'm1',
            type: 'BUTTON',
            name: '编辑',
            permissionCode: 'user:update',
            visible: true,
            status: 'ENABLED',
            sort: 1,
          },
        ],
      },
      {
        id: 'm2',
        parentId: 'd1',
        type: 'MENU',
        name: '角色管理',
        path: '/roles',
        visible: true,
        status: 'ENABLED',
        sort: 1,
      },
    ],
  },
];

describe('computeTreeState', () => {
  it('marks parents checked when all descendants are checked', () => {
    const state = computeTreeState(tree, new Set(['b1', 'b2', 'm1', 'm2']));
    expect(state.checkedSet.has('d1')).toBe(true);
    expect(state.checkedSet.has('m1')).toBe(true);
    expect(state.indeterminateSet.size).toBe(0);
  });

  it('marks parents indeterminate on partial selection', () => {
    const state = computeTreeState(tree, new Set(['b1']));
    expect(state.checkedSet.has('b1')).toBe(true);
    expect(state.checkedSet.has('m1')).toBe(false);
    expect(state.indeterminateSet.has('m1')).toBe(true);
    expect(state.indeterminateSet.has('d1')).toBe(true);
  });

  it('returns empty state for nothing checked', () => {
    const state = computeTreeState(tree, new Set());
    expect(state.checkedSet.size).toBe(0);
    expect(state.indeterminateSet.size).toBe(0);
  });
});

describe('toggleNodeInSet', () => {
  it('checks a parent and all descendants from empty', () => {
    const next = toggleNodeInSet(tree[0], new Set());
    expect([...next].sort()).toEqual(['b1', 'b2', 'd1', 'm1', 'm2']);
  });

  it('unchecks a fully checked parent and all descendants', () => {
    const next = toggleNodeInSet(tree[0], new Set(['b1', 'b2', 'm1', 'm2', 'd1']));
    expect(next.size).toBe(0);
  });

  it('checks all descendants from an indeterminate parent', () => {
    const next = toggleNodeInSet(tree[0], new Set(['b1']));
    expect([...next].sort()).toEqual(['b1', 'b2', 'd1', 'm1', 'm2']);
  });

  it('toggles a leaf independently', () => {
    const leaf = tree[0].children![1];
    expect(toggleNodeInSet(leaf, new Set(['m2'])).has('m2')).toBe(false);
    expect(toggleNodeInSet(leaf, new Set()).has('m2')).toBe(true);
  });

  it('collectIds returns the node and every descendant', () => {
    expect(collectIds(tree[0]).sort()).toEqual(['b1', 'b2', 'd1', 'm1', 'm2']);
  });
});
