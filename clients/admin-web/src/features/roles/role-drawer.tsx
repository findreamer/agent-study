'use client';

import { useEffect, useState } from 'react';
import { Input, Label, ListBox, Select, TextField, toast } from '@heroui/react';
import {
  createRoleSchema,
  updateRoleSchema,
  type RoleDetail,
} from '@agent-study/contracts';
import { ApiError } from '@/lib/api/client';
import { toastApiError } from '@/lib/api/error-toast';
import { useAuthStore } from '@/lib/auth/auth.store';
import { DrawerForm } from '@/lib/ui/drawer-form';
import { getMenuTree } from '@/features/permission-center/menus.api';
import { createRole, updateRole } from './roles.api';
import { MenuGrantTree } from './menu-grant-tree';

const DATA_SCOPE_OPTIONS = [
  { value: 'ALL', label: '全部' },
  { value: 'DEPT_AND_SUB', label: '本部门及以下' },
  { value: 'DEPT', label: '本部门' },
  { value: 'SELF', label: '仅本人' },
] as const;

const STATUS_OPTIONS = [
  { value: 'ENABLED', label: '启用' },
  { value: 'DISABLED', label: '停用' },
] as const;

interface RoleDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  role?: RoleDetail | null;
  onSaved: () => void;
}

interface RoleFormState {
  name: string;
  code: string;
  status: 'ENABLED' | 'DISABLED';
  priority: string;
  dataScope: 'ALL' | 'DEPT_AND_SUB' | 'DEPT' | 'SELF';
  remark: string;
}

const emptyForm: RoleFormState = {
  name: '',
  code: '',
  status: 'ENABLED',
  priority: '100',
  dataScope: 'SELF',
  remark: '',
};

function SelectField({
  label,
  selectedKey,
  options,
  onChange,
}: {
  label: string;
  selectedKey: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select className="w-full" selectedKey={selectedKey} onSelectionChange={(key) => key !== null && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((opt) => (
            <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
              {opt.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/** 角色 Drawer（640px）：基础字段 + 授权树（menuIds 全量覆盖提交）。 */
export function RoleDrawer({
  open,
  onClose,
  mode,
  role,
  onSaved,
}: RoleDrawerProps) {
  const [form, setForm] = useState<RoleFormState>(emptyForm);
  const [menuIds, setMenuIds] = useState<Set<string>>(new Set());
  const [menuTree, setMenuTree] = useState<Parameters<typeof MenuGrantTree>[0]['nodes']>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const currentSystemId = useAuthStore((s) =>
    s.systems.find((sys) => sys.code === s.currentSystemCode)?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (mode === 'edit' && role) {
      setForm({
        name: role.name,
        code: role.code,
        status: role.status,
        priority: String(role.priority),
        dataScope: role.dataScope,
        remark: role.remark ?? '',
      });
      setMenuIds(new Set(role.menuIds));
    } else {
      setForm(emptyForm);
      setMenuIds(new Set());
    }
  }, [open, mode, role]);

  useEffect(() => {
    if (!open || !currentSystemId) return;
    getMenuTree({ systemId: currentSystemId })
      .then(setMenuTree)
      .catch((e) => toastApiError(e, { fallback: '加载菜单树失败' }));
  }, [open, currentSystemId]);

  async function handleSubmit() {
    if (!currentSystemId) return;
    setFieldErrors({});
    setSaving(true);
    try {
      const priority = Number(form.priority);
      const base = {
        name: form.name.trim(),
        status: form.status,
        priority: Number.isInteger(priority) && priority >= 0 ? priority : 100,
        dataScope: form.dataScope,
        remark: form.remark.trim() || null,
        menuIds: [...menuIds],
      };
      if (mode === 'create') {
        const parsed = createRoleSchema.safeParse({ ...base, code: form.code.trim(), systemId: currentSystemId });
        if (!parsed.success) {
          applyIssues(parsed.error.issues);
          return;
        }
        await createRole(parsed.data);
      } else if (role) {
        const parsed = updateRoleSchema.safeParse({ ...base, code: form.code.trim() });
        if (!parsed.success) {
          applyIssues(parsed.error.issues);
          return;
        }
        await updateRole(role.id, parsed.data);
      }
      toast('已保存', { variant: 'success' });
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) applyIssues(e.issues);
      else toastApiError(e, { fallback: '保存角色失败' });
    } finally {
      setSaving(false);
    }
  }

  function applyIssues(issues: unknown) {
    const next: Record<string, string> = {};
    if (Array.isArray(issues)) {
      for (const issue of issues as Array<{ path?: string; message?: string }>) {
        if (issue.path && issue.message) next[issue.path] = issue.message;
      }
    }
    setFieldErrors(next);
  }

  return (
    <DrawerForm
      open={open}
      onOpenChange={(o) => (o ? undefined : onClose())}
      title={mode === 'create' ? '新建角色' : '编辑角色'}
      width={640}
      footerLoading={saving}
      onSubmit={() => void handleSubmit()}
    >
      <TextField
        name="name"
        isRequired
        value={form.name}
        onChange={(v) => setForm((f) => ({ ...f, name: v }))}
      >
        <Label>名称</Label>
        <Input placeholder="请输入角色名称" />
        {fieldErrors.name ? (
          <p className="text-xs text-destructive">{fieldErrors.name}</p>
        ) : null}
      </TextField>
      <TextField
        name="code"
        isRequired
        isDisabled={mode === 'edit'}
        value={form.code}
        onChange={(v) => setForm((f) => ({ ...f, code: v }))}
      >
        <Label>编码</Label>
        <Input placeholder="小写字母、数字、- 或 _" autoComplete="off" />
        {fieldErrors.code ? (
          <p className="text-xs text-destructive">{fieldErrors.code}</p>
        ) : null}
      </TextField>
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="状态"
          selectedKey={form.status}
          options={STATUS_OPTIONS}
          onChange={(v) => setForm((f) => ({ ...f, status: v as RoleFormState['status'] }))}
        />
        <TextField
          name="priority"
          isRequired
          value={form.priority}
          onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
        >
          <Label>优先级</Label>
          <Input type="number" min={0} />
          {fieldErrors.priority ? (
            <p className="text-xs text-destructive">{fieldErrors.priority}</p>
          ) : null}
        </TextField>
      </div>
      <SelectField
        label="数据范围"
        selectedKey={form.dataScope}
        options={DATA_SCOPE_OPTIONS}
        onChange={(v) => setForm((f) => ({ ...f, dataScope: v as RoleFormState['dataScope'] }))}
      />
      <TextField
        name="remark"
        value={form.remark}
        onChange={(v) => setForm((f) => ({ ...f, remark: v }))}
      >
        <Label>备注</Label>
        <Input placeholder="选填" />
      </TextField>
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-sm font-medium text-foreground">菜单与权限授权</p>
        {menuTree.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">菜单树加载中…</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <MenuGrantTree nodes={menuTree} checked={menuIds} onChange={setMenuIds} />
          </div>
        )}
      </div>
    </DrawerForm>
  );
}
