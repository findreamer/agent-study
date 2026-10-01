'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  TextField,
  toast,
} from '@heroui/react';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { resetPasswordSchema, type UserBrief } from '@agent-study/contracts';
import { toastApiError } from '@/lib/api/error-toast';
import { usePermissions } from '@/lib/auth/use-permissions';
import { PageHeader } from '@/lib/shell/page-header';
import { DrawerForm } from '@/lib/ui/drawer-form';
import { flattenTree } from '@/features/departments/departments.api';
import { DepartmentsManager } from '@/features/departments/departments.manager';
import { listUsers, resetUserPassword, updateUser } from './users.api';
import { UserDrawer } from './user-drawer';

const PAGE_SIZE = 10;

type UserDrawerState = { mode: 'create' } | { mode: 'edit'; user: UserBrief };

/** 用户管理页：搜索 + 部门筛选 + 表格分页 + 行级操作 + 部门管理 Drawer。 */
export default function UsersPage() {
  const { can } = usePermissions();
  const [query, setQuery] = useState<{ page: number; keyword?: string; departmentId?: string }>({
    page: 1,
  });
  const [keywordInput, setKeywordInput] = useState('');
  const [data, setData] = useState<{ items: UserBrief[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deptTree, setDeptTree] = useState<Parameters<typeof flattenTree>[0]>([]);
  const [deptManagerOpen, setDeptManagerOpen] = useState(false);
  const [userDrawer, setUserDrawer] = useState<UserDrawerState | null>(null);
  const [resetTarget, setResetTarget] = useState<UserBrief | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const flatDepartments = useMemo(() => flattenTree(deptTree), [deptTree]);
  const deptNameById = useMemo(
    () => new Map(flatDepartments.map((d) => [d.id, d.name])),
    [flatDepartments],
  );

  const loadUsers = useCallback(
    async (q: typeof query) => {
      setLoading(true);
      try {
        const res = await listUsers({
          page: q.page,
          pageSize: PAGE_SIZE,
          keyword: q.keyword,
          departmentId: q.departmentId,
        });
        setData({ items: res.items, total: res.total });
      } catch (e) {
        toastApiError(e, { fallback: '加载用户列表失败' });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadDepartments = useCallback(async () => {
    try {
      const { getDepartmentsTree } = await import('@/features/departments/departments.api');
      setDeptTree(await getDepartmentsTree());
    } catch (e) {
      toastApiError(e, { fallback: '加载部门树失败' });
    }
  }, []);

  useEffect(() => {
    void loadUsers(query);
  }, [query, loadUsers]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function search() {
    setQuery((q) => ({
      page: 1,
      keyword: keywordInput.trim() || undefined,
      departmentId: q.departmentId,
    }));
  }

  async function toggleStatus(user: UserBrief) {
    const next = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateUser(user.id, { status: next });
      void loadUsers(query);
    } catch (e) {
      toastApiError(e, { fallback: '更新用户状态失败' });
    }
  }

  async function submitReset() {
    if (!resetTarget) return;
    const parsed = resetPasswordSchema.safeParse({ newPassword });
    if (!parsed.success) {
      toast('新密码至少 8 位', { variant: 'danger' });
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.id, parsed.data.newPassword);
      toast('密码已重置', { variant: 'success' });
      setResetTarget(null);
      setNewPassword('');
    } catch (e) {
      toastApiError(e, { fallback: '重置密码失败' });
    } finally {
      setResetting(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="用户管理"
        actions={
          <>
            {can('dept:list') ? (
              <Button variant="secondary" onPress={() => setDeptManagerOpen(true)}>
                部门管理
              </Button>
            ) : null}
            {can('user:create') ? (
              <Button onPress={() => setUserDrawer({ mode: 'create' })}>
                <Plus size={16} aria-hidden />
                新建用户
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-4">
        <TextField
          name="keyword"
          value={keywordInput}
          onChange={setKeywordInput}
          className="w-64"
        >
          <Label>搜索</Label>
          <Input
            placeholder="用户名 / 昵称"
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
            }}
          />
        </TextField>
        <Select
          aria-label="按部门筛选"
          className="w-52"
          selectedKey={query.departmentId ?? 'all'}
          onSelectionChange={(key) =>
            setQuery((q) => ({
              ...q,
              page: 1,
              departmentId: key === 'all' || key === null ? undefined : String(key),
            }))
          }
        >
          <Label className="sr-only">按部门筛选</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="all" textValue="全部部门">
                全部部门
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {flatDepartments.map((dept) => (
                <ListBox.Item key={dept.id} id={dept.id} textValue={dept.name}>
                  {`${'　'.repeat(dept.depth)}${dept.name}`}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button variant="secondary" isPending={loading} onPress={search}>
          <Search size={16} aria-hidden />
          查询
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white">
        {items.length === 0 && !loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="用户列表" className="min-w-[720px]">
                <Table.Header>
                  <Table.Column isRowHeader>用户名</Table.Column>
                  <Table.Column>昵称</Table.Column>
                  <Table.Column>邮箱</Table.Column>
                  <Table.Column>部门</Table.Column>
                  <Table.Column>状态</Table.Column>
                  <Table.Column>操作</Table.Column>
                </Table.Header>
                <Table.Body>
                  {items.map((user) => (
                    <Table.Row key={user.id}>
                      <Table.Cell className="font-medium">{user.username}</Table.Cell>
                      <Table.Cell>{user.nickname}</Table.Cell>
                      <Table.Cell>{user.email ?? '—'}</Table.Cell>
                      <Table.Cell>
                        {user.departmentId
                          ? (deptNameById.get(user.departmentId) ?? '—')
                          : '—'}
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            user.status === 'ACTIVE'
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {user.status === 'ACTIVE' ? '启用' : '禁用'}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Dropdown>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={`${user.username} 的操作`}
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === 'edit') setUserDrawer({ mode: 'edit', user });
                                else if (key === 'reset') {
                                  setResetTarget(user);
                                  setNewPassword('');
                                } else if (key === 'toggle') void toggleStatus(user);
                              }}
                            >
                              {can('user:update') ? (
                                <Dropdown.Item id="edit" textValue="编辑">
                                  <Label>编辑</Label>
                                </Dropdown.Item>
                              ) : null}
                              {can('user:reset-password') ? (
                                <Dropdown.Item id="reset" textValue="重置密码">
                                  <Label>重置密码</Label>
                                </Dropdown.Item>
                              ) : null}
                              {can('user:update') ? (
                                <Dropdown.Item
                                  id="toggle"
                                  textValue={user.status === 'ACTIVE' ? '禁用' : '启用'}
                                >
                                  <Label>{user.status === 'ACTIVE' ? '禁用' : '启用'}</Label>
                                </Dropdown.Item>
                              ) : null}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>共 {total} 条</span>
              <div className="flex items-center gap-2">
                <span>
                  第 {query.page} / {totalPages} 页
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={query.page <= 1}
                  onPress={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={query.page >= totalPages}
                  onPress={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
                >
                  下一页
                </Button>
              </div>
            </div>
          </Table>
        )}
      </div>

      <DepartmentsManager
        open={deptManagerOpen}
        onOpenChange={setDeptManagerOpen}
        onChanged={() => {
          void loadDepartments();
          void loadUsers(query);
        }}
      />

      {userDrawer ? (
        <UserDrawer
          open
          onClose={() => setUserDrawer(null)}
          mode={userDrawer.mode}
          user={userDrawer.mode === 'edit' ? userDrawer.user : null}
          departments={flatDepartments}
          onSaved={() => void loadUsers(query)}
        />
      ) : null}

      <DrawerForm
        open={resetTarget !== null}
        onOpenChange={(o) => (o ? undefined : setResetTarget(null))}
        title={`重置密码：${resetTarget?.username ?? ''}`}
        footerLoading={resetting}
        onSubmit={() => void submitReset()}
      >
        <TextField
          name="newPassword"
          isRequired
          value={newPassword}
          onChange={setNewPassword}
        >
          <Label>新密码</Label>
          <Input type="password" autoComplete="new-password" placeholder="至少 8 位" />
        </TextField>
      </DrawerForm>
    </div>
  );
}
