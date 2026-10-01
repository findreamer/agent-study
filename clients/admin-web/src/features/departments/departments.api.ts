import type {
  CreateDepartmentInput,
  DepartmentNode,
  UpdateDepartmentInput,
} from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function getDepartmentsTree(): Promise<DepartmentNode[]> {
  return apiFetch<DepartmentNode[]>('/api/departments/tree');
}

export function createDepartment(
  input: CreateDepartmentInput,
): Promise<DepartmentNode> {
  return apiFetch<DepartmentNode>('/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
): Promise<DepartmentNode> {
  return apiFetch<DepartmentNode>(`/api/departments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function removeDepartment(id: string): Promise<void> {
  return apiFetch<void>(`/api/departments/${id}`, { method: 'DELETE' });
}

export type FlatDepartment = DepartmentNode & { depth: number };

/** 递归拍平部门树，带层级深度（用于下拉与缩进列表）。 */
export function flattenTree(
  nodes: DepartmentNode[],
  depth = 0,
): FlatDepartment[] {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenTree(node.children ?? [], depth + 1),
  ]);
}
