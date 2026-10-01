'use client';

import { useMemo } from 'react';
import { useAuthStore } from './auth.store';

/** 权限判定：超管恒 true；权限只做前端显隐短路，安全以后端 Guard 为准。 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions);
  const user = useAuthStore((s) => s.user);

  const codes = useMemo(() => new Set(permissions), [permissions]);
  const isSuperadmin = user?.isSuperadmin ?? false;

  return {
    codes,
    can: (code?: string | null) =>
      !code || isSuperadmin || codes.has(code),
  };
}

interface CanProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const { can } = usePermissions();
  return <>{can(permission) ? children : fallback}</>;
}
