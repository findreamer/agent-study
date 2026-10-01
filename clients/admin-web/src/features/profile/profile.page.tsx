'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Table, Tabs, TextField, toast } from '@heroui/react';
import { changePasswordSchema, type SessionInfo } from '@agent-study/contracts';
import { ApiError } from '@/lib/api/client';
import { toastApiError } from '@/lib/api/error-toast';
import { useAuthStore } from '@/lib/auth/auth.store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { PageHeader } from '@/lib/shell/page-header';
import { flattenTree } from '@/features/departments/departments.api';
import { getUser } from '@/features/users/users.api';
import { listRoles } from '@/features/roles/roles.api';
import { changePassword, listSessions, revokeSession } from './profile.api';

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-none">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** 个人信息页：基本信息（只读）/ 修改密码 / 会话管理 三个 Tabs。 */
export default function ProfilePage() {
  const router = useRouter();
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const currentSystemId = useAuthStore((s) =>
    s.systems.find((sys) => sys.code === s.currentSystemCode)?.id ?? null,
  );
  const clear = useAuthStore((s) => s.clear);

  const [departmentName, setDepartmentName] = useState('—');
  const [roleNames, setRoleNames] = useState<string[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch (e) {
      toastApiError(e, { fallback: '加载会话列表失败' });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.departmentId) {
      import('@/features/departments/departments.api').then(async ({ getDepartmentsTree }) => {
        try {
          const tree = await getDepartmentsTree();
          const hit = flattenTree(tree).find((d) => d.id === user.departmentId);
          setDepartmentName(hit?.name ?? '—');
        } catch {
          setDepartmentName('—');
        }
      });
    }
    // 后端 profile 不含角色列表：有 user:list 权限时拉取本人详情补足展示
    if (can('user:list')) {
      Promise.all([getUser(user.id), currentSystemId ? listRoles({ systemId: currentSystemId, page: 1, pageSize: 100 }) : null])
        .then(([detail, rolesPage]) => {
          const nameById = new Map((rolesPage?.items ?? []).map((r) => [r.id, r.name]));
          setRoleNames(detail.roleIds.map((id) => nameById.get(id) ?? id));
        })
        .catch(() => setRoleNames(null));
    }
    void loadSessions();
  }, [user, can, currentSystemId, loadSessions]);

  const isSuperadmin = user?.isSuperadmin ?? false;

  async function handleChangePassword() {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    const parsed = changePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) {
      setPasswordError('新密码至少 8 位，且不能与旧密码相同');
      return;
    }
    setChanging(true);
    try {
      await changePassword(parsed.data);
      toast('密码已修改，其他设备已下线', { variant: 'success' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void loadSessions();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPasswordError('旧密码错误');
      } else {
        toastApiError(e, { fallback: '修改密码失败' });
      }
    } finally {
      setChanging(false);
    }
  }

  async function handleRevoke(session: SessionInfo) {
    try {
      await revokeSession(session.familyId);
      if (session.current) {
        toast('当前设备已下线', { variant: 'success' });
        clear();
        router.replace('/login');
        return;
      }
      toast('会话已下线', { variant: 'success' });
      void loadSessions();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clear();
        router.replace('/login');
        return;
      }
      toastApiError(e, { fallback: '下线会话失败' });
    }
  }

  const sessionItems = sessions ?? [];
  const roleText = useMemo(() => {
    if (isSuperadmin) return '超级管理员';
    if (roleNames && roleNames.length > 0) return roleNames.join('、');
    if (roleNames) return '—';
    return '—';
  }, [isSuperadmin, roleNames]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="个人信息" />
      <div className="rounded-lg border border-border bg-white p-6">
        <Tabs className="w-full" defaultSelectedKey="basic">
          <Tabs.ListContainer>
            <Tabs.List aria-label="个人中心">
              <Tabs.Tab id="basic">基本信息</Tabs.Tab>
              <Tabs.Tab id="password">修改密码</Tabs.Tab>
              <Tabs.Tab id="sessions">会话管理</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="basic">
            <div className="mx-auto mt-4 max-w-xl">
              <InfoRow label="用户名" value={user?.username ?? '—'} />
              <InfoRow label="昵称" value={user?.nickname ?? '—'} />
              <InfoRow label="邮箱" value={user?.email ?? '—'} />
              <InfoRow label="部门" value={departmentName} />
              <InfoRow label="角色" value={roleText} />
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="password">
            <form
              className="mx-auto mt-4 flex max-w-md flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleChangePassword();
              }}
            >
              {passwordError ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {passwordError}
                </p>
              ) : null}
              <TextField name="oldPassword" isRequired value={oldPassword} onChange={setOldPassword}>
                <Label>旧密码</Label>
                <Input type="password" autoComplete="current-password" />
              </TextField>
              <TextField name="newPassword" isRequired value={newPassword} onChange={setNewPassword}>
                <Label>新密码</Label>
                <Input type="password" autoComplete="new-password" placeholder="至少 8 位" />
              </TextField>
              <TextField
                name="confirmPassword"
                isRequired
                value={confirmPassword}
                onChange={setConfirmPassword}
              >
                <Label>确认新密码</Label>
                <Input type="password" autoComplete="new-password" />
              </TextField>
              <Button type="submit" isPending={changing} isDisabled={changing}>
                修改密码
              </Button>
            </form>
          </Tabs.Panel>

          <Tabs.Panel id="sessions">
            <div className="mt-4 rounded-lg border border-border">
              {sessionItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">暂无会话</p>
              ) : (
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="会话列表" className="min-w-[640px]">
                      <Table.Header>
                        <Table.Column isRowHeader>设备</Table.Column>
                        <Table.Column>IP</Table.Column>
                        <Table.Column>最近使用</Table.Column>
                        <Table.Column>状态</Table.Column>
                        <Table.Column>操作</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {sessionItems.map((session) => (
                          <Table.Row key={session.familyId}>
                            <Table.Cell className="max-w-[320px] truncate">
                              {session.userAgent ?? '未知设备'}
                            </Table.Cell>
                            <Table.Cell>{session.ip ?? '—'}</Table.Cell>
                            <Table.Cell>{formatTime(session.lastUsedAt)}</Table.Cell>
                            <Table.Cell>
                              {session.current ? (
                                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  当前设备
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">其他设备</span>
                              )}
                            </Table.Cell>
                            <Table.Cell>
                              <Button
                                size="sm"
                                variant={session.current ? 'secondary' : 'danger'}
                                isDisabled={session.current}
                                onPress={() => void handleRevoke(session)}
                              >
                                下线
                              </Button>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              )}
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  );
}
