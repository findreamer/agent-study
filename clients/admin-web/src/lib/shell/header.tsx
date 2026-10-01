'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Dropdown,
  Label,
  ListBox,
  Select,
} from '@heroui/react';
import { LogOut, UserCircle } from 'lucide-react';
import type { LoginResponse } from '@agent-study/contracts';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    useAuthStore.getState().clear();
  }
}

export function Header() {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const user = useAuthStore((s) => s.user);
  const systems = useAuthStore((s) => s.systems);
  const currentSystemCode = useAuthStore((s) => s.currentSystemCode);

  const currentSystem = systems.find((s) => s.code === currentSystemCode);

  async function switchSystem(code: string) {
    if (code === currentSystemCode || switching) return;
    setSwitching(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/switch-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemCode: code }),
      });
      useAuthStore.getState().setSession(res);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  async function handleMenuAction(key: string) {
    if (key === 'profile') {
      router.push('/profile');
    } else if (key === 'logout') {
      await logout();
      router.replace('/login');
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-white px-6">
      <div className="text-sm font-medium text-foreground">
        {currentSystem?.name ?? 'RBAC 管理后台'}
      </div>
      <div className="flex items-center gap-3">
        {systems.length > 1 ? (
          <Select
            aria-label="切换系统"
            className="w-44"
            selectedKey={currentSystemCode ?? undefined}
            isDisabled={switching}
            onSelectionChange={(key) => {
              if (key !== null) void switchSystem(String(key));
            }}
          >
            <Label className="sr-only">切换系统</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {systems.map((s) => (
                  <ListBox.Item key={s.code} id={s.code} textValue={s.name}>
                    {s.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        ) : null}
        <Dropdown>
          <Button variant="ghost" className="gap-2">
            <UserCircle size={18} aria-hidden />
            {user?.nickname ?? user?.username}
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu onAction={(key) => void handleMenuAction(String(key))}>
              <Dropdown.Item id="profile" textValue="个人信息">
                <span className="flex items-center gap-2">
                  <UserCircle size={16} aria-hidden />
                  个人信息
                </span>
              </Dropdown.Item>
              <Dropdown.Item id="logout" textValue="退出登录" variant="danger">
                <span className="flex items-center gap-2">
                  <LogOut size={16} aria-hidden />
                  退出登录
                </span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </header>
  );
}
