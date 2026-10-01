'use client';

import { useEffect, useState } from 'react';
import { Checkbox, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import {
  createUserSchema,
  updateUserSchema,
  type RoleBrief,
  type UserBrief,
} from '@agent-study/contracts';
import { ApiError } from '@/lib/api/client';
import { toastApiError } from '@/lib/api/error-toast';
import { useAuthStore } from '@/lib/auth/auth.store';
import { DrawerForm } from '@/lib/ui/drawer-form';
import { flattenTree, type FlatDepartment } from '../departments/departments.api';
import { createUser, getUser, updateUser } from './users.api';
import { listRoles } from '../roles/roles.api';

interface UserDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  user?: UserBrief | null;
  departments: FlatDepartment[];
  onSaved: () => void;
}

interface UserFormState {
  username: string;
  password: string;
  nickname: string;
  email: string;
  departmentId: string | null;
  roleIds: string[];
}

const emptyForm: UserFormState = {
  username: '',
  password: '',
  nickname: '',
  email: '',
  departmentId: null,
  roleIds: [],
};

/** 新建/编辑用户 Drawer：创建含初始密码，编辑用户名禁用；角色多选自当前系统。 */
export function UserDrawer({
  open,
  onClose,
  mode,
  user,
  departments,
  onSaved,
}: UserDrawerProps) {
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentSystemId = useAuthStore((s) =>
    s.systems.find((sys) => sys.code === s.currentSystemCode)?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (mode === 'create') {
      setForm(emptyForm);
      return;
    }
    if (!user) return;
    setLoading(true);
    getUser(user.id)
      .then((detail) =>
        setForm({
          username: detail.username,
          password: '',
          nickname: detail.nickname,
          email: detail.email ?? '',
          departmentId: detail.departmentId ?? null,
          roleIds: detail.roleIds,
        }),
      )
      .catch((e) => toastApiError(e, { fallback: '加载用户详情失败' }))
      .finally(() => setLoading(false));
  }, [open, mode, user]);

  useEffect(() => {
    if (!open || !currentSystemId) return;
    listRoles({ page: 1, pageSize: 100, systemId: currentSystemId })
      .then((res) => setRoles(res.items))
      .catch((e) => toastApiError(e, { fallback: '加载角色列表失败' }));
  }, [open, currentSystemId]);

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
    setFieldErrors({});
    setSaving(true);
    try {
      if (mode === 'create') {
        const parsed = createUserSchema.safeParse({
          username: form.username.trim(),
          password: form.password,
          nickname: form.nickname.trim(),
          email: form.email.trim() || null,
          departmentId: form.departmentId,
          roleIds: form.roleIds,
        });
        if (!parsed.success) {
          applyIssues(
            parsed.error.issues.map((i) => ({
              path: String(i.path[0] ?? ''),
              message: i.message,
            })),
          );
          return;
        }
        await createUser(parsed.data);
      } else if (user) {
        const parsed = updateUserSchema.safeParse({
          nickname: form.nickname.trim(),
          email: form.email.trim() || null,
          departmentId: form.departmentId,
          roleIds: form.roleIds,
        });
        if (!parsed.success) {
          applyIssues(
            parsed.error.issues.map((i) => ({
              path: String(i.path[0] ?? ''),
              message: i.message,
            })),
          );
          return;
        }
        await updateUser(user.id, parsed.data);
      }
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) applyIssues(e.issues);
      else toastApiError(e, { conflict: '用户名已存在', fallback: '保存用户失败' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerForm
      open={open}
      onOpenChange={(o) => (o ? undefined : onClose())}
      title={mode === 'create' ? '新建用户' : '编辑用户'}
      footerLoading={saving || loading}
      onSubmit={() => void handleSubmit()}
    >
      <TextField
        name="username"
        isRequired
        isDisabled={mode === 'edit'}
        value={form.username}
        onChange={(v) => setForm((f) => ({ ...f, username: v }))}
      >
        <Label>用户名</Label>
        <Input autoComplete="off" placeholder="4-32 位字母、数字或下划线" />
        {fieldErrors.username ? (
          <p className="text-xs text-destructive">{fieldErrors.username}</p>
        ) : null}
      </TextField>
      {mode === 'create' ? (
        <TextField
          name="password"
          isRequired
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
        >
          <Label>初始密码</Label>
          <Input type="password" autoComplete="new-password" placeholder="至少 8 位" />
          {fieldErrors.password ? (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          ) : null}
        </TextField>
      ) : null}
      <TextField
        name="nickname"
        isRequired
        value={form.nickname}
        onChange={(v) => setForm((f) => ({ ...f, nickname: v }))}
      >
        <Label>昵称</Label>
        <Input placeholder="请输入昵称" />
        {fieldErrors.nickname ? (
          <p className="text-xs text-destructive">{fieldErrors.nickname}</p>
        ) : null}
      </TextField>
      <TextField
        name="email"
        value={form.email}
        onChange={(v) => setForm((f) => ({ ...f, email: v }))}
      >
        <Label>邮箱</Label>
        <Input type="email" placeholder="选填" />
        {fieldErrors.email ? (
          <p className="text-xs text-destructive">{fieldErrors.email}</p>
        ) : null}
      </TextField>
      <Select
        name="departmentId"
        className="w-full"
        selectedKey={form.departmentId ?? 'none'}
        onSelectionChange={(key) =>
          setForm((f) => ({
            ...f,
            departmentId: key === 'none' || key === null ? null : String(key),
          }))
        }
      >
        <Label>所属部门</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="none" textValue="未分配">
              未分配
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {departments.map((dept) => (
              <ListBox.Item
                key={dept.id}
                id={dept.id}
                textValue={dept.name}
              >
                {`${'　'.repeat(dept.depth)}${dept.name}`}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <div className="flex flex-col gap-2">
        <Label>角色</Label>
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">当前系统暂无可分配角色</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roles.map((role) => (
              <Checkbox
                key={role.id}
                isSelected={form.roleIds.includes(role.id)}
                onChange={(selected) =>
                  setForm((f) => ({
                    ...f,
                    roleIds: selected
                      ? [...f.roleIds, role.id]
                      : f.roleIds.filter((id) => id !== role.id),
                  }))
                }
              >
                {role.name}
              </Checkbox>
            ))}
          </div>
        )}
        {fieldErrors.roleIds ? (
          <p className="text-xs text-destructive">{fieldErrors.roleIds}</p>
        ) : null}
      </div>
    </DrawerForm>
  );
}
