'use client';

import { redirect } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth.store';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) redirect('/');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
