'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { useAuthStore } from '@/lib/auth/auth.store';
import { componentRegistry } from '@/lib/registry';

function findComponentKey(nodes: ReturnType<typeof useAuthStore.getState>['menus'], path: string): string | null {
  for (const node of nodes) {
    if (node.type === 'MENU' && node.path === path && node.component) {
      return node.component;
    }
    const child = findComponentKey(node.children ?? [], path);
    if (child) return child;
  }
  return null;
}

/** 显式路由优先；catch-all 按后端菜单 component key 解析注册表，未匹配 404。 */
export default function CatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = use(params);
  const menus = useAuthStore((s) => s.menus);

  const path = `/${slug.join('/')}`;
  const key = findComponentKey(menus, path);
  const Page = key ? componentRegistry[key] : undefined;

  if (!Page) notFound();
  return <Page />;
}
