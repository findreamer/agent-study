'use client';

import { Checkbox } from '@heroui/react';
import type { MenuNode } from '@agent-study/contracts';

export interface TreeState {
  checkedSet: Set<string>;
  indeterminateSet: Set<string>;
}

/**
 * 纯函数：父节点 checked ⇔ 全部后代 checked；部分选中 → indeterminate。
 * 授权提交时输出 checkedSet（含 DIR id）作为 menuIds 全量覆盖。
 */
export function computeTreeState(
  nodes: MenuNode[],
  checked: Set<string>,
): TreeState {
  const checkedSet = new Set<string>();
  const indeterminateSet = new Set<string>();

  const walk = (node: MenuNode): { all: boolean; some: boolean } => {
    const children = node.children ?? [];
    if (children.length === 0) {
      const isChecked = checked.has(node.id);
      if (isChecked) checkedSet.add(node.id);
      return { all: isChecked, some: isChecked };
    }
    const results = children.map(walk);
    const all = results.every((r) => r.all);
    const some = results.some((r) => r.some);
    if (all) checkedSet.add(node.id);
    else if (some) indeterminateSet.add(node.id);
    return { all, some };
  };

  nodes.forEach(walk);
  return { checkedSet, indeterminateSet };
}

/** 节点及全部后代 id（含 DIR），用于勾选父节点时的全量传播。 */
export function collectIds(node: MenuNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)];
}

/** 点击节点：未全选（含部分选中）→ 全选后代；已全选 → 全不选后代。 */
export function toggleNodeInSet(node: MenuNode, checked: Set<string>): Set<string> {
  const next = new Set(checked);
  const ids = collectIds(node);
  const allChecked = ids.every((id) => next.has(id));
  if (allChecked) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

interface MenuGrantTreeProps {
  nodes: MenuNode[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
}

/** 三态 Checkbox 授权树：DIR/MENU 为分组节点，BUTTON 展示权限码。 */
export function MenuGrantTree({ nodes, checked, onChange }: MenuGrantTreeProps) {
  const state = computeTreeState(nodes, checked);

  const render = (node: MenuNode, depth: number): React.ReactNode => {
    const children = node.children ?? [];
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1.5"
          style={{ paddingLeft: depth * 20 }}
        >
          <Checkbox
            aria-label={node.name}
            isSelected={state.checkedSet.has(node.id)}
            isIndeterminate={state.indeterminateSet.has(node.id)}
            onChange={() => onChange(toggleNodeInSet(node, checked))}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="text-sm text-foreground">{node.name}</span>
            </Checkbox.Content>
          </Checkbox>
          {node.type === 'BUTTON' && node.permissionCode ? (
            <code className="font-mono text-xs text-muted-foreground">
              {node.permissionCode}
            </code>
          ) : null}
        </div>
        {children.map((child) => render(child, depth + 1))}
      </div>
    );
  };

  return <div>{nodes.map((node) => render(node, 0))}</div>;
}
