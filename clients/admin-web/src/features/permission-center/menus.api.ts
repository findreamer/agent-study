import type {
  CreateMenuInput,
  MenuNode,
  MenuTreeQuery,
  UpdateMenuInput,
} from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function getMenuTree(query: MenuTreeQuery): Promise<MenuNode[]> {
  const params = new URLSearchParams({ systemId: query.systemId });
  return apiFetch<MenuNode[]>(`/api/menus/tree?${params.toString()}`);
}

export function createMenu(input: CreateMenuInput): Promise<MenuNode> {
  return apiFetch<MenuNode>('/api/menus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateMenu(id: string, input: UpdateMenuInput): Promise<MenuNode> {
  return apiFetch<MenuNode>(`/api/menus/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function removeMenu(id: string): Promise<void> {
  return apiFetch<void>(`/api/menus/${id}`, { method: 'DELETE' });
}
