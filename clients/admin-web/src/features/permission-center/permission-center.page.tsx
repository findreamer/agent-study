'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  Table,
  TextField,
  toast,
} from '@heroui/react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createMenuSchema,
  updateMenuSchema,
  type MenuNode,
} from '@agent-study/contracts';
import { toastApiError } from '@/lib/api/error-toast';
import { usePermissions } from '@/lib/auth/use-permissions';
import { useAuthStore } from '@/lib/auth/auth.store';
import { PageHeader } from '@/lib/shell/page-header';
import { DrawerForm } from '@/lib/ui/drawer-form';
import { createMenu, getMenuTree, removeMenu, updateMenu } from './menus.api';

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<string, string> = {
  DIR: '目录',
  MENU: '菜单',
  BUTTON: '按钮',
};

const STATUS_LABEL: Record<string, string> = {
  ENABLED: '启用',
  DISABLED: '停用',
};

type MenuDrawerState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; node: MenuNode }
  | null;

interface MenuFormState {
  type: 'DIR' | 'MENU' | 'BUTTON';
  name: string;
  parentId: string | null;
  path: string;
  component: string;
  icon: string;
  permissionCode: string;
  visible: boolean;
  status: 'ENABLED' | 'DISABLED';
  sort: string;
}

const emptyForm: MenuFormState = {
  type: 'MENU',
  name: '',
  parentId: null,
  path: '',
  component: '',
  icon: '',
  permissionCode: '',
  visible: true,
  status: 'ENABLED',
  sort: '0',
};

function flatten(nodes: MenuNode[], depth = 0): Array<MenuNode & { depth: number }> {
  return nodes.flatMap((n) => [
    { ...n, depth },
    ...flatten(n.children ?? [], depth + 1),
  ]);
}

/** 权限配置中心：系统切换（超管）+ 树形表格 + 菜单/权限码 CRUD Drawer。 */
export default function PermissionCenterPage() {
  const { can } = usePermissions();
  const systems = useAuthStore((s) => s.systems);
  const currentSystemCode = useAuthStore((s) => s.currentSystemCode);
  const currentSystemId = useMemo(
    () => systems.find((s) => s.code === currentSystemCode)?.id ?? null,
    [systems, currentSystemCode],
  );
  const isSuperadmin = useAuthStore((s) => s.user?.isSuperadmin ?? false);

  const [viewSystemId, setViewSystemId] = useState<string | null>(null);
  const systemId = viewSystemId ?? currentSystemId;
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<MenuDrawerState>(null);
  const [form, setForm] = useState<MenuFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setViewSystemId(null);
  }, [currentSystemId]);

  const load = useCallback(async () => {
    if (!systemId) return;
    setLoading(true);
    try {
      setTree(await getMenuTree({ systemId }));
    } catch (e) {
      toastApiError(e, { fallback: '加载菜单树失败' });
    } finally {
      setLoading(false);
    }
  }, [systemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const flat = flatten(tree);
    if (!keyword.trim()) return flat;
    const kw = keyword.trim().toLowerCase();
    return flat.filter(
      (n) =>
        n.name.toLowerCase().includes(kw) ||
        (n.permissionCode ?? '').toLowerCase().includes(kw) ||
        (n.path ?? '').toLowerCase().includes(kw),
    );
  }, [tree, keyword]);

  useEffect(() => {
    if (!drawer) return;
    setFieldErrors({});
    if (drawer.mode === 'create') {
      setForm({ ...emptyForm, parentId: drawer.parentId });
    } else {
      const n = drawer.node;
      setForm({
        type: n.type,
        name: n.name,
        parentId: n.parentId,
        path: n.path ?? '',
        component: n.component ?? '',
        icon: n.icon ?? '',
        permissionCode: n.permissionCode ?? '',
        visible: n.visible,
        status: n.status,
        sort: String(n.sort),
      });
    }
  }, [drawer]);

  function applyIssues(issues: unknown) {
    const next: Record<string, string> = {};
    if (Array.isArray(issues)) {
      for (const issue of issues as Array<{ path?: string; message?: string }>) {
        if (issue.path && issue.message) next[issue.path] = issue.message;
      }
    }
    setFieldErrors(next);
  }

  async function handleSubmit() {
    if (!systemId) return;
    setFieldErrors({});
    setSaving(true);
    try {
      const base = {
        type: form.type,
        name: form.name.trim(),
        parentId: form.parentId,
        path: form.type === 'BUTTON' ? null : form.path.trim() || null,
        component: form.type === 'BUTTON' ? null : form.component.trim() || null,
        icon: form.icon.trim() || null,
        permissionCode: form.permissionCode.trim() || null,
        visible: form.visible,
        sort: Number.isInteger(Number(form.sort)) && Number(form.sort) >= 0 ? Number(form.sort) : 0,
        status: form.status,
      };
      if (drawer?.mode === 'create') {
        const parsed = createMenuSchema.safeParse({ ...base, systemId });
        if (!parsed.success) {
          applyIssues(parsed.error.issues);
          return;
        }
        await createMenu(parsed.data);
      } else if (drawer?.mode === 'edit') {
        const parsed = updateMenuSchema.safeParse(base);
        if (!parsed.success) {
          applyIssues(parsed.error.issues);
          return;
        }
        await updateMenu(drawer.node.id, parsed.data);
      }
      toast('已保存', { variant: 'success' });
      setDrawer(null);
      void load();
    } catch (e) {
      toastApiError(e, { conflict: '存在子节点', fallback: '保存节点失败' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(node: MenuNode) {
    try {
      await removeMenu(node.id);
      toast('节点已删除', { variant: 'success' });
      void load();
    } catch (e) {
      toastApiError(e, { conflict: '存在子节点' });
    }
  }

  const parentOptions = [
    { id: 'root', label: '顶级' },
    ...flatten(tree)
      .filter((n) => n.type !== 'BUTTON' && drawer?.mode !== 'edit')
      .map((n) => ({ id: n.id, label: `${'　'.repeat(n.depth)}${n.name}` })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="权限配置中心"
        description="维护菜单树与按钮权限码，变更实时下发到角色授权树"
        actions={
          can('menu:create') ? (
            <Button onPress={() => setDrawer({ mode: 'create', parentId: null })}>
              <Plus size={16} aria-hidden />
              新建节点
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white p-4">
        {isSuperadmin && systems.length > 1 ? (
          <Select
            aria-label="切换系统"
            className="w-52"
            selectedKey={systemId ?? undefined}
            onSelectionChange={(key) => key !== null && setViewSystemId(String(key))}
          >
            <Label className="sr-only">切换系统</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {systems.map((s) => (
                  <ListBox.Item key={s.id} id={s.id} textValue={s.name}>
                    {s.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        ) : null}
        <TextField
          name="keyword"
          value={keywordInput}
          onChange={setKeywordInput}
          className="w-64"
        >
          <Label>搜索</Label>
          <Input
            placeholder="名称 / 权限码 / 路径"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setKeyword(keywordInput);
            }}
          />
        </TextField>
        <Button variant="secondary" isPending={loading} onPress={() => setKeyword(keywordInput)}>
          查询
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white">
        {rows.length === 0 && !loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="菜单树" className="min-w-[880px]">
                <Table.Header>
                  <Table.Column isRowHeader>名称</Table.Column>
                  <Table.Column>类型</Table.Column>
                  <Table.Column>权限码</Table.Column>
                  <Table.Column>路径 / 组件</Table.Column>
                  <Table.Column>可见</Table.Column>
                  <Table.Column>状态</Table.Column>
                  <Table.Column>排序</Table.Column>
                  <Table.Column>操作</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((node) => (
                    <Table.Row key={node.id}>
                      <Table.Cell className="font-medium">
                        <span style={{ paddingLeft: node.depth * 20 }}>{node.name}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          {TYPE_LABEL[node.type] ?? node.type}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        {node.permissionCode ? (
                          <code className="font-mono text-xs text-muted-foreground">
                            {node.permissionCode}
                          </code>
                        ) : (
                          '—'
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {node.path || node.component
                          ? [node.path, node.component].filter(Boolean).join(' · ')
                          : '—'}
                      </Table.Cell>
                      <Table.Cell>{node.visible ? '是' : '否'}</Table.Cell>
                      <Table.Cell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            node.status === 'ENABLED'
                              ? 'bg-success/10 text-success'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {STATUS_LABEL[node.status] ?? node.status}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{node.sort}</Table.Cell>
                      <Table.Cell>
                        {can('menu:update') || can('menu:delete') ? (
                          <div className="flex items-center gap-1">
                            {can('menu:update') ? (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                aria-label={`编辑 ${node.name}`}
                                onPress={() => setDrawer({ mode: 'edit', node })}
                              >
                                <Pencil size={14} aria-hidden />
                              </Button>
                            ) : null}
                            {can('menu:delete') ? (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                aria-label={`删除 ${node.name}`}
                                onPress={() => void handleDelete(node)}
                              >
                                <Trash2 size={14} aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        )}
      </div>

      <DrawerForm
        open={drawer !== null}
        onOpenChange={(o) => (o ? undefined : setDrawer(null))}
        title={drawer?.mode === 'edit' ? '编辑节点' : '新建节点'}
        footerLoading={saving}
        onSubmit={() => void handleSubmit()}
      >
        <div className="grid grid-cols-2 gap-4">
          <Select
            className="w-full"
            selectedKey={form.type}
            onSelectionChange={(key) => key !== null && setForm((f) => ({ ...f, type: String(key) as MenuFormState['type'] }))}
          >
            <Label>类型</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(['DIR', 'MENU', 'BUTTON'] as const).map((t) => (
                  <ListBox.Item key={t} id={t} textValue={TYPE_LABEL[t]}>
                    {TYPE_LABEL[t]}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Select
            className="w-full"
            selectedKey={form.parentId ?? 'root'}
            onSelectionChange={(key) =>
              setForm((f) => ({
                ...f,
                parentId: key === 'root' || key === null ? null : String(key),
              }))
            }
          >
            <Label>父节点</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {parentOptions.map((opt) => (
                  <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label.trim()}>
                    {opt.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <TextField
          name="name"
          isRequired
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
        >
          <Label>名称</Label>
          <Input placeholder="请输入节点名称" />
          {fieldErrors.name ? (
            <p className="text-xs text-destructive">{fieldErrors.name}</p>
          ) : null}
        </TextField>
        {form.type !== 'BUTTON' ? (
          <div className="grid grid-cols-2 gap-4">
            <TextField
              name="path"
              value={form.path}
              onChange={(v) => setForm((f) => ({ ...f, path: v }))}
            >
              <Label>路径</Label>
              <Input placeholder="/example" autoComplete="off" />
              {fieldErrors.path ? (
                <p className="text-xs text-destructive">{fieldErrors.path}</p>
              ) : null}
            </TextField>
            <TextField
              name="component"
              value={form.component}
              onChange={(v) => setForm((f) => ({ ...f, component: v }))}
            >
              <Label>组件</Label>
              <Input placeholder="registry key（菜单）" autoComplete="off" />
            </TextField>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <TextField
            name="permissionCode"
            value={form.permissionCode}
            onChange={(v) => setForm((f) => ({ ...f, permissionCode: v }))}
          >
            <Label>权限码</Label>
            <Input placeholder="resource:action" autoComplete="off" />
            {fieldErrors.permissionCode ? (
              <p className="text-xs text-destructive">{fieldErrors.permissionCode}</p>
            ) : null}
          </TextField>
          <TextField
            name="icon"
            value={form.icon}
            onChange={(v) => setForm((f) => ({ ...f, icon: v }))}
          >
            <Label>图标</Label>
            <Input placeholder="lucide 图标名" autoComplete="off" />
          </TextField>
        </div>
        <div className="grid grid-cols-2 items-center gap-4">
          <TextField
            name="sort"
            value={form.sort}
            onChange={(v) => setForm((f) => ({ ...f, sort: v }))}
          >
            <Label>排序</Label>
            <Input type="number" min={0} />
          </TextField>
          <Switch
            name="visible"
            isSelected={form.visible}
            onChange={(selected) => setForm((f) => ({ ...f, visible: selected }))}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>侧边栏可见</Label>
          </Switch>
        </div>
        <Select
          className="w-full"
          selectedKey={form.status}
          onSelectionChange={(key) =>
            key !== null &&
            setForm((f) => ({ ...f, status: String(key) as MenuFormState['status'] }))
          }
        >
          <Label>状态</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {(['ENABLED', 'DISABLED'] as const).map((s) => (
                <ListBox.Item key={s} id={s} textValue={STATUS_LABEL[s]}>
                  {STATUS_LABEL[s]}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </DrawerForm>
    </div>
  );
}
