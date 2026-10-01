'use client';

import { useEffect, useRef } from 'react';
import type { ProfileResponse } from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';

const REFETCH_INTERVAL_MS = 30_000;

/**
 * 窗口聚焦时节流（≥30s）静默重拉 profile：权限被改后前端体验能自愈，
 * 403 时仍由各页面 Toast 提示「权限已变更，请刷新」。在 (admin)/layout 调用一次。
 */
export function useFocusRefetch() {
  const lastFetchedAt = useRef(0);

  useEffect(() => {
    const onFocus = async () => {
      const now = Date.now();
      if (now - lastFetchedAt.current < REFETCH_INTERVAL_MS) return;
      lastFetchedAt.current = now;
      try {
        const profile = await apiFetch<ProfileResponse>('/api/auth/profile');
        useAuthStore.getState().setProfile(profile);
      } catch {
        // 静默失败：refresh 失败时 apiFetch 已 clear()，引导流程会接管跳登录
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
}
