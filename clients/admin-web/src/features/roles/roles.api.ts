import type { Paged, RoleBrief, RoleListQuery } from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function listRoles(query: RoleListQuery): Promise<Paged<RoleBrief>> {
  const params = new URLSearchParams({
    systemId: query.systemId,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set('keyword', query.keyword);
  return apiFetch<Paged<RoleBrief>>(`/api/roles?${params.toString()}`);
}
