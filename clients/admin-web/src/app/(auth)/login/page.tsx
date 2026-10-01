'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, Label, TextField } from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginResponse } from '@agent-study/contracts';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ username: username.trim(), password });
    if (!parsed.success) {
      setError('请输入用户名和密码（密码至少 8 位）');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      useAuthStore.getState().setSession(res);
      router.replace(searchParams.get('redirect') ?? '/users');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? '用户名或密码错误'
          : '登录失败，请稍后重试',
      );
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-[400px] shadow-md">
      <Card.Header className="flex flex-col items-center gap-1 pt-8">
        <Card.Title className="text-xl font-semibold text-foreground">
          RBAC 管理后台
        </Card.Title>
        <Card.Description className="text-muted-foreground">
          请登录您的账号以继续
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-8 pb-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <TextField name="username" isRequired value={username} onChange={setUsername}>
            <Label>用户名</Label>
            <Input autoComplete="username" placeholder="请输入用户名" />
          </TextField>
          <TextField name="password" isRequired value={password} onChange={setPassword}>
            <Label>密码</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="请输入密码"
                className="w-full pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </TextField>
          <Button type="submit" fullWidth isPending={loading} isDisabled={loading}>
            {loading ? '登录中…' : '登 录'}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
