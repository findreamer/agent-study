import type {
  CreateUserInput,
  Paged,
  UpdateUserInput,
  UserBrief,
  UserDetail,
  UserListQuery,
} from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function listUsers(query: UserListQuery): Promise<Paged<UserBrief>> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.departmentId) params.set('departmentId', query.departmentId);
  return apiFetch<Paged<UserBrief>>(`/api/users?${params.toString()}`);
}

export function getUser(id: string): Promise<UserDetail> {
  return apiFetch<UserDetail>(`/api/users/${id}`);
}

export function createUser(input: CreateUserInput): Promise<UserDetail> {
  return apiFetch<UserDetail>('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUser(id: string, input: UpdateUserInput): Promise<UserDetail> {
  return apiFetch<UserDetail>(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function resetUserPassword(id: string, newPassword: string): Promise<void> {
  return apiFetch<void>(`/api/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
}
