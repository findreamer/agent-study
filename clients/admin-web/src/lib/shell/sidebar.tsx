'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Circle,
  KeyRound,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { MenuNode } from '@agent-study/contracts';
import { useAuthStore } from '@/lib/auth/auth.store';

const iconMap: Record<string, LucideIcon> = {
  settings: Settings,
  users: Users,
  'key-round': KeyRound,
  'shield-check': ShieldCheck,
  'user-circle': UserCircle,
};

function MenuIcon({ icon }: { icon?: string | null }) {
  const Icon = (icon ? iconMap[icon] : undefined) ?? Circle;
  return <Icon size={20} aria-hidden />;
}

function MenuLink({ menu }: { menu: MenuNode }) {
  const pathname = usePathname();
  const active = pathname === menu.path;

  return (
    <Link
      href={menu.path ?? '#'}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm transition-colors ${
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-foreground/80 hover:bg-muted/40 hover:text-foreground'
      }`}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
        />
      ) : null}
      <MenuIcon icon={menu.icon} />
      <span className="truncate">{menu.name}</span>
    </Link>
  );
}

export function Sidebar() {
  const menus = useAuthStore((s) => s.menus);

  const visible = menus.filter(
    (m) => m.status === 'ENABLED' && m.visible && m.type !== 'BUTTON',
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-20 w-[272px] border-r border-border bg-white">
      <nav className="flex flex-col gap-1 overflow-y-auto px-3 py-4">
        {visible.map((node) =>
          node.type === 'DIR' ? (
            <div key={node.id} className="pt-4 pb-1 first:pt-0">
              <div className="px-3 text-xs text-muted-foreground">{node.name}</div>
            </div>
          ) : (
            <MenuLink key={node.id} menu={node} />
          ),
        )}
      </nav>
    </aside>
  );
}
