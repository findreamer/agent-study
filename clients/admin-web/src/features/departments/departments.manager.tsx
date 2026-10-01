'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
  toast,
} from '@heroui/react';
import type { DepartmentNode } from '@agent-study/contracts';
import {
  createDepartment,
  flattenTree,
  getDepartmentsTree,
  removeDepartment,
  updateDepartment,
} from './departments.api';
import { toastApiError } from '@/lib/api/error-toast';

interface DepartmentsManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 部门变更后通知外层刷新列表 */
  onChanged?: () => void;
}

interface DeptFormState {
  name: string;
  parentId: string | null;
  leader: string;
  sort: string;
}

const emptyForm: DeptFormState = { name: '', parentId: null, leader: '', sort: '0' };

/** 部门管理 Drawer：左侧缩进树选中，行内操作新建/编辑/删除，表单内嵌。 */
export function DepartmentsManager({
  open,
  onOpenChange,
  onChanged,
}: DepartmentsManagerProps) {
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
  const [form, setForm] = useState<DeptFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const flat = flattenTree(tree);
  const selected = flat.find((n) => n.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await getDepartmentsTree());
    } catch (e) {
      toastApiError(e, { fallback: '加载部门树失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const descendantIds = (id: string): string[] => {
    const node = flat.find((n) => n.id === id);
    if (!node) return [];
    return [
      id,
      ...(node.children ?? []).flatMap((c) => descendantIds(c.id)),
    ];
  };

  const parentOptions = flat
    .filter((n) => mode !== 'edit' || !descendantIds(selectedId ?? '').includes(n.id))
    .map((n) => ({ id: n.id, label: `${'　'.repeat(n.depth)}${n.name}` }));

  function startCreate() {
    setForm({ ...emptyForm, parentId: selectedId });
    setMode('create');
  }

  function startEdit() {
    if (!selected) return;
    setForm({
      name: selected.name,
      parentId: selected.parentId,
      leader: selected.leader ?? '',
      sort: String(selected.sort),
    });
    setMode('edit');
  }

  async function handleDelete() {
    if (!selectedId) return;
    try {
      await removeDepartment(selectedId);
      toast('部门已删除', { variant: 'success' });
      setSelectedId(null);
      setMode('idle');
      await reload();
      onChanged?.();
    } catch (e) {
      toastApiError(e, { conflict: '存在子部门或用户' });
    }
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) {
      toast('请输入部门名称', { variant: 'danger' });
      return;
    }
    const payload = {
      name,
      parentId: form.parentId,
      leader: form.leader.trim() || null,
      sort: Number.isFinite(Number(form.sort)) ? Math.max(0, Number(form.sort)) : 0,
      status: 'ENABLED' as const,
    };
    setSaving(true);
    try {
      if (mode === 'create') {
        await createDepartment(payload);
      } else if (mode === 'edit' && selectedId) {
        await updateDepartment(selectedId, payload);
      }
      toast('已保存', { variant: 'success' });
      setMode('idle');
      setForm(emptyForm);
      await reload();
      onChanged?.();
    } catch (e) {
      toastApiError(e, { fallback: '保存部门失败' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer>
      <Drawer.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex flex-col" style={{ width: 'min(480px, 100vw)' }}>
            <Drawer.CloseTrigger aria-label="关闭" />
            <Drawer.Header>
              <Drawer.Heading className="text-base font-semibold text-foreground">
                部门管理
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-4">
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                {loading && flat.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">加载中…</p>
                ) : (
                  flat.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(node.id);
                        setMode('idle');
                      }}
                      style={{ paddingLeft: 12 + node.depth * 20 }}
                      className={`block w-full cursor-pointer py-2 pr-3 text-left text-sm transition-colors ${
                        selectedId === node.id
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-secondary'
                      }`}
                    >
                      {node.name}
                      {node.leader ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {node.leader}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selected ? (
                  <>
                    <Button size="sm" variant="secondary" onPress={startCreate}>
                      新建子部门
                    </Button>
                    <Button size="sm" variant="secondary" onPress={startEdit}>
                      编辑
                    </Button>
                    <Button size="sm" variant="danger" onPress={() => void handleDelete()}>
                      删除
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    请选择一个部门，或直接在下方表单新建顶级部门
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                <p className="text-sm font-medium text-foreground">
                  {mode === 'edit' ? '编辑部门' : '新建部门'}
                </p>
                <TextField name="name" isRequired value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))}>
                  <Label>名称</Label>
                  <Input placeholder="请输入部门名称" />
                </TextField>
                <Select
                  name="parentId"
                  className="w-full"
                  selectedKey={form.parentId ?? 'root'}
                  onSelectionChange={(key) =>
                    setForm((f) => ({
                      ...f,
                      parentId: key === 'root' || key === null ? null : String(key),
                    }))
                  }
                >
                  <Label>父部门</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="root" textValue="顶级">
                        顶级
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {parentOptions.map((opt) => (
                        <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label.trim()}>
                          {opt.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <TextField name="leader" value={form.leader} onChange={(v) => setForm((f) => ({ ...f, leader: v }))}>
                  <Label>负责人</Label>
                  <Input placeholder="选填" />
                </TextField>
                <TextField name="sort" value={form.sort} onChange={(v) => setForm((f) => ({ ...f, sort: v }))}>
                  <Label>排序</Label>
                  <Input type="number" min={0} />
                </TextField>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setMode('idle');
                      setForm(emptyForm);
                    }}
                  >
                    重置
                  </Button>
                  <Button isPending={saving} isDisabled={saving} onPress={() => void handleSave()}>
                    保存
                  </Button>
                </div>
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
