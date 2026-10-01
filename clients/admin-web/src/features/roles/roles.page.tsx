'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Label,
  Table,
  TextField,
  toast,
} from '@heroui/react';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import type { RoleDetail } from '@agent-study/contracts';
import { toastApiError } from '@/lib/api/error-toast';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useAuthStore } from '@/lib/auth/auth.store';
import { PageHeader } from '@/lib/shell/page-header';
import { listRoles, removeRole } from './roles.api';
import { RoleDrawer } from './role-drawer';

const PAGE_SIZE = 10;

const DATA_SCOPE_LABEL: Record<string, string> = {
  ALL: '全部',
  DEPT_AND_SUB: '本部门及以下',
  DEPT: '本部门',
  SELF: '仅本人',
};

type RoleDrawerState = { mode: 'create' } | { mode: 'edit'; role: RoleDetail };

/** 角色管理页：搜索 + 表格分页 + 行级操作，角色作用域恒为当前系统。 */
export default function RolesPage() {
  const { can } = usePermissions();
  const currentSystemId = useAuthStore((s) =>
    s.systems.find((sys) => sys.code === s.currentSystemCode)?.id ?? null,
  );
  const [query, setQuery] = useState<{ page: number; keyword?: string }>({ page: 1 });
  const [keywordInput, setKeywordInput] = useState('');
  const [data, setData] = useState<{ items: RoleDetail[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<RoleDrawerState | null>(null);

  const load = useCallback(
    async (q: typeof query) => {
      if (!currentSystemId) return;
      setLoading(true);
      try {
        const res = await listRoles({
          systemId: currentSystemId,
          page: q.page,
          pageSize: PAGE_SIZE,
          keyword: q.keyword,
        });
        setData({ items: res.items, total: res.total });
      } catch (e) {
        toastApiError(e, { fallback: '加载角色列表失败' });
      } finally {
        setLoading(false);
      }
    },
    [currentSystemId],
  );

  useEffect(() => {
    void load(query);
  }, [query, load]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  async function handleDelete(role: RoleDetail) {
    try {
      await removeRole(role.id);
      toast('角色已删除', { variant: 'success' });
      void load(query);
    } catch (e) {
      toastApiError(e, { conflict: '角色已分配给用户' });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="角色管理"
        actions={
          can('role:create') ? (
            <Button onPress={() => setDrawer({ mode: 'create' })}>
              <Plus size={16} aria-hidden />
              新建角色
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-white p-4">
        <TextField
          name="keyword"
          value={keywordInput}
          onChange={setKeywordInput}
          className="w-64"
        >
          <Label>搜索</Label>
          <Input
            placeholder="名称 / 编码"
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                setQuery((q) => ({ page: 1, keyword: keywordInput.trim() || undefined }));
            }}
          />
        </TextField>
        <Button
          variant="secondary"
          isPending={loading}
          onPress={() =>
            setQuery((q) => ({ page: 1, keyword: keywordInput.trim() || undefined }))
          }
        >
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
              <Table.Content aria-label="角色列表" className="min-w-[720px]">
                <Table.Header>
                  <Table.Column isRowHeader>名称</Table.Column>
                  <Table.Column>编码</Table.Column>
                  <Table.Column>优先级</Table.Column>
                  <Table.Column>数据范围</Table.Column>
                  <Table.Column>状态</Table.Column>
                  <Table.Column>操作</Table.Column>
                </Table.Header>
                <Table.Body>
                  {items.map((role) => (
                    <Table.Row key={role.id}>
                      <Table.Cell className="font-medium">{role.name}</Table.Cell>
                      <Table.Cell>
                        <code className="font-mono text-xs">{role.code}</code>
                      </Table.Cell>
                      <Table.Cell>{role.priority}</Table.Cell>
                      <Table.Cell>
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          {DATA_SCOPE_LABEL[role.dataScope] ?? role.dataScope}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            role.status === 'ENABLED'
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {role.status === 'ENABLED' ? '启用' : '停用'}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <Dropdown>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={`${role.name} 的操作`}
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === 'edit') setDrawer({ mode: 'edit', role });
                                else if (key === 'delete') void handleDelete(role);
                              }}
                            >
                              {can('role:update') ? (
                                <Dropdown.Item id="edit" textValue="编辑">
                                  <Label>编辑</Label>
                                </Dropdown.Item>
                              ) : null}
                              {can('role:delete') ? (
                                <Dropdown.Item id="delete" textValue="删除" variant="danger">
                                  <Label>删除</Label>
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

      {drawer ? (
        <RoleDrawer
          open
          onClose={() => setDrawer(null)}
          mode={drawer.mode}
          role={drawer.mode === 'edit' ? drawer.role : null}
          onSaved={() => void load(query)}
        />
      ) : null}
    </div>
  );
}
