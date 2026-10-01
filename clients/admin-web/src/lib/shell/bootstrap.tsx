'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Spinner } from '@heroui/react';
import type { ProfileResponse } from '@agent-study/contracts';
import { apiFetch, refreshOnce } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';

/**
 * (admin) 路由组引导：首挂且未引导时，若内存无 accessToken 先用 httpOnly
 * cookie 单飞刷新换取 token，再拉取 profile 写回 store；任一步失败跳登录页
 * 并带回跳地址。引导期间整屏 Spinner，避免子页面闪现未授权内容。
 */
export function Bootstrap({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (bootstrapped) return;
    let cancelled = false;

    (async () => {
      if (!useAuthStore.getState().accessToken) {
        const ok = await refreshOnce();
        if (cancelled) return;
        if (!ok) {
          setRedirecting(true);
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }
      }
      try {
        const profile = await apiFetch<ProfileResponse>('/api/auth/profile');
        if (cancelled) return;
        useAuthStore.getState().setProfile(profile);
        useAuthStore.getState().setBootstrapped(true);
      } catch {
        if (!cancelled) {
          setRedirecting(true);
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapped, pathname, router]);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" aria-label={redirecting ? '跳转登录页…' : '加载中…'} />
      </div>
    );
  }
  return <>{children}</>;
}
