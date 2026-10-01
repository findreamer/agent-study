import type { ChangePasswordInput, SessionInfo } from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiFetch<void>('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function listSessions(): Promise<SessionInfo[]> {
  return apiFetch<SessionInfo[]>('/api/auth/sessions');
}

export function revokeSession(familyId: string): Promise<void> {
  return apiFetch<void>(`/api/auth/sessions/${familyId}`, { method: 'DELETE' });
}
