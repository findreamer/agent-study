'use client';

import { Bootstrap } from '@/lib/shell/bootstrap';
import { Header } from '@/lib/shell/header';
import { Sidebar } from '@/lib/shell/sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Bootstrap>
      <div className="min-h-dvh bg-background">
        <Sidebar />
        <div className="pl-[272px]">
          <Header />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </Bootstrap>
  );
}
