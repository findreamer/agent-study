import type {
  CreateRoleInput,
  Paged,
  RoleDetail,
  RoleListQuery,
  UpdateRoleInput,
} from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function listRoles(query: RoleListQuery): Promise<Paged<RoleDetail>> {
  const params = new URLSearchParams({
    systemId: query.systemId,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set('keyword', query.keyword);
  return apiFetch<Paged<RoleDetail>>(`/api/roles?${params.toString()}`);
}

export function createRole(input: CreateRoleInput): Promise<RoleDetail> {
  return apiFetch<RoleDetail>('/api/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateRole(
  id: string,
  input: UpdateRoleInput,
): Promise<RoleDetail> {
  return apiFetch<RoleDetail>(`/api/roles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function removeRole(id: string): Promise<void> {
  return apiFetch<void>(`/api/roles/${id}`, { method: 'DELETE' });
}
