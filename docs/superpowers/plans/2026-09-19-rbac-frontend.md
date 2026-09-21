# RBAC 前端实施计划（clients/admin-web）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# RBAC Frontend Implementation Plan

**Goal:** 交付 RBAC 后台前端：登录与会话引导、权限驱动侧边栏/按钮/动态路由、系统切换，以及用户/角色/菜单/部门/系统/个人中心六大管理界面。

**Architecture:** Next.js 16 App Router；`(auth)` 与 `(admin)` 两个路由组；状态用 zustand 内存 store（不持久化）；封装 fetch（自动带 AT、401 单飞刷新重试、cookie 凭证）；UI 全部使用 HeroUI v3（Tailwind v4，无 Provider）；权限判定前端短路体验，安全以后端 Guard 为准。

**Tech Stack:** Next.js 16.3、React 19.2、Tailwind CSS 4、HeroUI 3.2.6（@heroui/react + @heroui/styles）、zustand 5、zod、@agent-study/contracts、vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-09-19-rbac-design.md` 第 6 节

## Global Constraints

- 端口 **3003**；API base `NEXT_PUBLIC_API_BASE_URL=http://localhost:4002`；后端全局前缀 `/api`。
- 所有请求 `credentials: 'include'`（RefreshToken 靠 httpOnly cookie，名 `rt`）。
- AccessToken 只存 zustand 内存，**禁止 localStorage/sessionStorage/persist 中间件**。
- 前端权限只控制显隐与提示；不做安全假设，403 时 Toast 提示"权限已变更，请刷新"。
- HeroUI v3 组件 API 查询：`curl "https://heroui.com/api/agent/page?path=/docs/react/components/<name>"`（如 table、modal、select、checkbox、toast、dropdown、tabs、autocomplete）；写代码前先读对应文档。
- 界面文案中文；每个 Task 跑 `bun run typecheck`，通过后按给定 message 提交。
- 前端测试只覆盖纯逻辑（单飞刷新、权限判定、store）；页面行为在第三阶段用 GUI 黑盒验收。

## File Structure

```
clients/admin-web/
  package.json next.config.ts postcss.config.mjs tsconfig.json eslint.config.mjs
  .env.example
  src/
    app/
      layout.tsx globals.css
      (auth)/layout.tsx (auth)/login/page.tsx
      (admin)/layout.tsx
      (admin)/page.tsx                                    # Dashboard
      (admin)/[...slug]/page.tsx                          # 动态组件注册表兜底
      (admin)/system/{users,roles,menus,departments,systems}/page.tsx
      (admin)/profile/{page.tsx,sessions/page.tsx}
    lib/
      api/client.ts                                       # fetch 封装 + 单飞刷新
      auth/auth.store.ts                                  # zustand
      auth/use-permissions.tsx                            # usePermissions + <Can>
      shell/use-focus-refetch.ts                          # 聚焦节流重拉
      components/page-header.tsx                          # 页面通用标题/操作区
    features/
      users/{users.api.ts,users.page.tsx,user-form.tsx}
      roles/{roles.api.ts,roles.page.tsx,role-form.tsx,menu-grant-tree.tsx}
      menus/{menus.api.ts,menus.page.tsx,menu-form.tsx}
      departments/{departments.api.ts,departments.page.tsx,department-form.tsx}
      systems/{systems.api.ts,systems.page.tsx,system-form.tsx}
      profile/{profile.api.ts,change-password.tsx,sessions.tsx}
```

---

### Task 1: 脚手架（Next 16 + Tailwind 4 + HeroUI v3）

**Files:**
- Create: `clients/admin-web/` 全部配置文件、`src/app/{layout.tsx,globals.css}`
- Modify: 根 `package.json`（dev 脚本可选过滤）

**Interfaces:**
- Produces: `bun --bun next dev -p 3003` 启动，首页渲染一个 HeroUI Button，HMR 正常。

- [ ] **Step 1: package.json**

```json
{
  "name": "@agent-study/admin-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start --port 3003",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@agent-study/contracts": "workspace:*",
    "@heroui/react": "3.2.6",
    "next": "16.3.5",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zustand": "^5.0.2",
    "zod": "^3.25"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@types/node": "^24",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5.7",
    "vitest": "^4",
    "jsdom": "^25.0.1",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

- [ ] **Step 2: 配置文件（直接复制 chat-web 再改）**

`next.config.ts`（改端口无关，改 env 默认值与 transpile）：

```ts
import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@agent-study/contracts'],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4002',
  },
};
export default nextConfig;
```

postcss.config.mjs、tsconfig.json（paths 加 `"@/*": ["./src/*"]`，保留 contracts paths 继承注意：tsconfig 直接复制 chat-web 后补 paths）、eslint.config.mjs 均复制 chat-web。

`.env.example`：

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4002
```

- [ ] **Step 3: globals.css 与根 layout**

```css
@import "@heroui/styles";
```

`src/app/layout.tsx`：`<html lang="zh-CN"><body className="min-h-screen bg-content1 antialiased">{children}</body></html>`，metadata title "RBAC 管理后台"。

- [ ] **Step 4: 临时首页验证**

`src/app/page.tsx` 渲染 `import { Button } from '@heroui/react'` 的 `<Button color="primary">测试</Button>`。

- [ ] **Step 5: 安装并验证**

```bash
bun install
bun run dev &  # 打开 http://localhost:3003 看到 HeroUI 按钮；无样式报错
```

- [ ] **Step 6: vitest 配置（供后续 Task）**

`vitest.config.ts`：`plugins:[react()]`，`test.environment='jsdom'`，`globals:true`，`setupFiles:['./vitest.setup.ts']`；`vitest.setup.ts` 内 `import '@testing-library/jest-dom/vitest'`。

- [ ] **Step 7: Commit** `feat(admin-web): scaffold next.js with tailwind 4 and heroui`

---

### Task 2: API Client + Auth Store（TDD）

**Files:**
- Create: `src/lib/api/client.ts`、`src/lib/auth/auth.store.ts`、对应 `.test.tsx`

**Interfaces:**
- Produces:
- `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` —— 拼 `API_BASE + path`、`credentials:'include'`、带 `Authorization: Bearer <at>`；401 时单飞 `/api/auth/refresh` 后重试一次；解包统一响应壳直接返回 `data`；非 2xx 抛 `ApiError(status, message)`。
- `ApiError`（含 status/message）。
- zustand `useAuthStore`：state `{ accessToken: string|null; user: UserBrief|null; currentSystemCode: string; systems: SystemBrief[]; menus: MenuNode[]; permissions: string[]; bootstrapped: boolean }`；actions `setSession({accessToken, profile})`、`setProfile(profile)`、`clear()`。

- [ ] **Step 1: client.test.ts（失败测试）**，用 `global.fetch` mock + store setter 覆盖：
  1. 正常 GET 附 Bearer，返回解包后的 data；
  2. 首个响应 401 → 仅触发一次 refresh（并发两个 apiFetch 断言 fetch refresh 调用次数为 1）→ 用新 token 重试成功；
  3. refresh 也 401 → 调 `clear()` 并抛 ApiError(401)；
  4. 403 抛 ApiError 不触发 refresh；
  5. 422 抛 ApiError 且 error 上带 issues。
  测试提示：mock fetch 按 URL 分支（`/api/auth/refresh` 返回 `{code:0,data:{accessToken:'at2'}}`）；单飞验证用 `Promise.all([apiFetch('/a'),apiFetch('/b')])`。
- [ ] **Step 2: Run** `bun test src/lib/api/client.test.ts` Expected FAIL。
- [ ] **Step 3: 实现 client.ts**

```ts
import type { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4002';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

export async function refreshOnce(
  setTokens?: (token: string) => void,
): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { code: 0; data: { accessToken: string } };
      setTokens?.(body.data.accessToken);
      // store 更新由调用方注入的回调完成（见 Step 4 接线）
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestWithAuth<T>(path, init, false);
}

async function requestWithAuth<T>(
  path: string,
  init: RequestInit,
  retried: boolean,
): Promise<T> {
  const { accessToken, applyRefreshedToken } = await getAuthHooks();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !retried) {
    const ok = await refreshOnce(applyRefreshedToken);
    if (!ok) {
      clearAuth();
      throw new ApiError(401, 'unauthorized');
    }
    return requestWithAuth<T>(path, init, true);
  }

  const body = (await res.json().catch(() => null)) as
    | { code: number; data: T; message: string; issues?: unknown }
    | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? res.statusText, body?.issues);
  }
  return body!.data;
}

// 由 auth.store.ts 在模块加载时注入，避免 client 直接依赖 React/store 模块产生循环
interface AuthHooks {
  accessToken: string | null;
  applyRefreshedToken: (token: string) => void;
}
let hooks: AuthHooks = { accessToken: null, applyRefreshedToken: () => {} };
export function registerAuthHooks(next: AuthHooks) {
  hooks = next;
}
async function getAuthHooks(): Promise<AuthHooks> {
  return hooks;
}
function clearAuth() {
  hooks.applyRefreshedToken('');
  clearStore?.();
}
let clearStore: (() => void) | null = null;
export function registerClearStore(fn: () => void) {
  clearStore = fn;
}
```

注意：上面 `z` 导入未使用，删掉；`registerAuthHooks/registerClearStore` 由 store 注入。

- [ ] **Step 4: 实现 auth.store.ts 并注入 hooks**

```ts
import { create } from 'zustand';
import type {
  MenuNode,
  ProfileResponse,
  SystemBrief,
  UserBrief,
} from '@agent-study/contracts';
import { registerAuthHooks, registerClearStore } from '../api/client';

interface AuthState {
  accessToken: string | null;
  user: UserBrief | null;
  currentSystemCode: string;
  systems: SystemBrief[];
  menus: MenuNode[];
  permissions: string[];
  bootstrapped: boolean;
  setSession: (input: { accessToken: string; profile: ProfileResponse }) => void;
  setProfile: (profile: ProfileResponse) => void;
  setBootstrapped: (value: boolean) => void;
  clear: () => void;
}

const initial = {
  accessToken: null,
  user: null,
  currentSystemCode: '',
  systems: [],
  menus: [],
  permissions: [],
  bootstrapped: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initial,
  setSession: ({ accessToken, profile }) =>
    set({ accessToken, ...profileFields(profile), bootstrapped: true }),
  setProfile: (profile) => set(profileFields(profile)),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
  clear: () => set(initial),
}));

function profileFields(profile: ProfileResponse) {
  return {
    user: profile.user,
    currentSystemCode: profile.currentSystemCode,
    systems: profile.systems,
    menus: profile.menus,
    permissions: profile.permissions,
  };
}

// Inject store bridges into the non-React api client.
registerAuthHooks({
  get accessToken() {
    return useAuthStore.getState().accessToken;
  },
  applyRefreshedToken: (token) =>
    useAuthStore.setState({ accessToken: token || null }),
});
registerClearStore(() => useAuthStore.getState().clear());
```

- [ ] **Step 5: store 的轻量测试**：`setSession` 后 state 含 menus/permissions；`clear` 复位。
- [ ] **Step 6: Run 全绿 + typecheck + Commit** `feat(admin-web): api client with single-flight refresh and auth store`

---

### Task 3: 登录页

**Files:**
- Create: `src/app/(auth)/layout.tsx`、`src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `apiFetch('/api/auth/login', {method:'POST', body})` 返回 `LoginResponse`；`useAuthStore.setSession`。

- [ ] **Step 1: login page** —— `"use client"`；HeroUI `Card/Input/Button`（写前查 modal/input 文档确认 API）；表单 username/password；调 `POST /api/auth/login`；成功 `setSession` 后 `router.replace(searchParams.get('redirect') ?? '/')`；失败 Toast/内联错误"用户名或密码错误"；提交时 loading 禁用按钮。
- [ ] **Step 2: (auth)/layout.tsx** —— 若 store 已有 accessToken，`redirect('/')`；否则渲染 children（居中卡片布局）。
- [ ] **Step 3: 手工验证**：错误密码显示错误；admin/Admin@123456 登录跳转，后端无 cookie 报错（此时后端应已启动）。
- [ ] **Step 4: Commit** `feat(admin-web): login page`

---

### Task 4: Admin Shell（引导 + 侧边栏 + Header + Dashboard）

**Files:**
- Create: `src/app/(admin)/layout.tsx`、`(admin)/page.tsx`
- Create: `src/lib/shell/{sidebar.tsx,header.tsx,bootstrap.tsx}`

**Interfaces:**
- Consumes: store、`apiFetch('/api/auth/refresh')`（经单飞）、`apiFetch('/api/auth/profile')`。

- [ ] **Step 1: Bootstrap 逻辑（layout.tsx，"use client"）**：
  - 首次挂载且 `!bootstrapped`：若 `accessToken` 为空，先 `refreshOnce()`（client.ts 导出）；成功后再 `apiFetch<ProfileResponse>('/api/auth/profile')` → `setProfile`；refresh 失败 → `router.replace('/login?redirect=' + pathname)`；
  - 全程全屏 Spinner（`<div class="flex h-screen items-center justify-center">`）；
  - 完成后渲染 shell：`<Sidebar/> + 右侧 flex-col（<Header/> + <main class="flex-1 overflow-auto p-6">{children}</main>）`。
- [ ] **Step 2: Sidebar** —— 从 store.menus 渲染：只取 `status==='ENABLED' && visible` 的 DIR/MENU；DIR 渲染为分组标题（或可折叠）；MENU 用 `next/link`，href=menu.path；当前路由高亮（usePathname startsWith）；BUTTON 不渲染。按 sort 排序。
- [ ] **Step 3: Header** —— 左侧系统切换器（Task 4 先用原生 Select 占位，系统 >1 才显示；调 `POST /api/auth/switch-system`，成功 `setSession`-like 更新（accessToken + profile 都返回））；右侧 Dropdown：nickname + 菜单（个人中心 →/profile；登出 → `POST /api/auth/logout` → clear → router.replace('/login')）。
- [ ] **Step 4: Dashboard page** —— 欢迎卡片 + 系统信息（当前系统、权限数）。
- [ ] **Step 5: 手工验证**：未登录访问 `/system/users` 被引导登录并回跳；刷新整页靠 cookie 恢复；登出后跳登录。
- [ ] **Step 6: Commit** `feat(admin-web): bootstrap shell, permission sidebar and header`

---

### Task 5: 权限基件 `<Can>` / usePermissions（TDD）

**Files:**
- Create: `src/lib/auth/use-permissions.tsx`、`src/lib/shell/use-focus-refetch.ts`、测试文件

**Interfaces:**
- Produces: `usePermissions(): { codes: Set<string>; can(code): boolean }`（超管 can 恒 true）；`<Can permission="x" fallback?={null}>`；窗口聚焦节流 ≥30s 重拉 profile。

- [ ] **Step 1: use-permissions.test.tsx**：渲染 `<Can permission="user:create">x</Can>`：granted → 显示 x；missing → 不显示；user.isSuperadmin → 任意码显示。
- [ ] **Step 2: 实现**

```tsx
"use client";
import { createContext, useContext, type ReactNode } from 'react';
import { useAuthStore } from './auth.store';

export function usePermissions() {
  const { permissions, user } = useAuthStore();
  const codes = new Set(permissions);
  return {
    codes,
    can: (code: string) => user?.isSuperadmin === true || codes.has(code),
  };
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = usePermissions();
  return <>{can(permission) ? children : fallback}</>;
}
```

- [ ] **Step 3: use-focus-refetch.ts**：挂载后监听 `window` `focus`，节流 30s（记录上次时间戳），触发 `apiFetch<ProfileResponse>('/api/auth/profile')` → setProfile；在 (admin)/layout 内调用一次。
- [ ] **Step 4: Run 测试 + typecheck + Commit** `feat(admin-web): can component, usePermissions and focus refetch`

---

### Task 6: 组件注册表 + 动态路由兜底

**Files:**
- Create: `src/lib/registry.tsx`、`src/app/(admin)/[...slug]/page.tsx`

**Interfaces:** 显式路由优先；未命中显式路由的菜单路径走 catch-all，按 store 菜单节点的 `component` key 在注册表解析。

- [ ] **Step 1: registry.tsx**

```tsx
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// 新页面在此登记：component key -> 懒加载组件
export const componentRegistry: Record<string, ComponentType> = {
  dashboard: dynamic(() => import('../app/(admin)/page')),
  'system/users': dynamic(() => import('../features/users/users.page')),
  'system/roles': dynamic(() => import('../features/roles/roles.page')),
  'system/menus': dynamic(() => import('../features/menus/menus.page')),
  'system/departments': dynamic(
    () => import('../features/departments/departments.page'),
  ),
  'system/systems': dynamic(
    () => import('../features/systems/systems.page'),
  ),
  profile: dynamic(() => import('../features/profile/change-password')),
  'profile/sessions': dynamic(() => import('../features/profile/sessions')),
};
```

- [ ] **Step 2: catch-all page**：拿 `params.slug` 拼出 path `/<join>`；从 store.menus 深度查找 path 匹配节点 → 取 component key → registry 解析渲染；无匹配 `notFound()`。
- [ ] **Step 3: 验证** 显式路由正常（Next 显式优先于动态）；手动给 DB 加一个注册过组件的菜单可访问。
- [ ] **Step 4: Commit** `feat(admin-web): component registry and catch-all route`

---

### Task 7: 部门管理（Departments Feature）

**Files:**
- Create: `features/departments/{departments.api.ts,departments.page.tsx,department-form.tsx}`
- Create（路由薄壳）: `app/(admin)/system/departments/page.tsx` re-export feature page
- Test: `departments.api` 纯请求函数可忽略测试

**Interfaces:**
- `getDepartmentsTree(): Promise<DepartmentNode[]>` → `GET /api/departments/tree`
- `createDepartment(input): Promise<DepartmentNode>` → POST `/api/departments`
- `updateDepartment(id, input)` → PATCH `/api/departments/:id`
- `removeDepartment(id)` → DELETE `/api/departments/:id`
- 另导出 `getAllDepartmentsFlat()`：由 tree 拍平（供用户表单选择器）。

- [ ] **Step 1: api.ts** —— 用 contracts 的 create/update schema 类型 + apiFetch 实现上述 5 个函数（tree 拍平函数 `flattenTree` 递归 push）。
- [ ] **Step 2: departments.page.tsx** —— PageHeader（标题"部门管理"+ 新增按钮，按钮挂 `<Can permission="department:create">`）；树形展示：用 HeroUI Table 或缩进行（`paddingLeft = depth*24`），列：名称、负责人、排序、操作（编辑 `department:update`、删除 `department:delete`）；删除调接口，ApiError 409 Toast 提示"存在子部门或用户"；刷新树。
- [ ] **Step 3: department-form.tsx** —— HeroUI Modal：名称（必填）、父部门（Select：拍平列表含"顶级部门"）、负责人、排序；编辑时回填；提交成功后关闭刷新；422 显示 issues。
- [ ] **Step 4: 路由薄壳 + 手工验证 CRUD（含防环与删除保护提示）+ Commit** `feat(admin-web): departments management`

---

### Task 8: 用户管理（Users Feature）

**Files:** `features/users/{users.api.ts,users.page.tsx,user-form.tsx}`、路由薄壳 `app/(admin)/system/users/page.tsx`

**Interfaces:**
- `listUsers(query: UserListQuery): Promise<Paged<UserBrief>>` → GET `/api/users`
- `getUser(id): Promise<UserDetail>` → GET `/api/users/:id`
- `createUser(input)` → POST `/api/users`
- `updateUser(id, input)` → PATCH `/api/users/:id`
- `resetUserPassword(id, newPassword)` → POST `/api/users/:id/reset-password`

- [ ] **Step 1: api.ts** 实现 5 个函数（query 用 URLSearchParams 拼 page/pageSize/keyword/departmentId）。
- [ ] **Step 2: users.page.tsx**：
  - PageHeader + 顶部筛选（keyword 输入 + 部门 Select（来自 departments tree 拍平）+ 查询按钮 + 新增 `user:create`）；
  - HeroUI Table 列：用户名、昵称、邮箱、部门、状态（Chip）、操作；分页器（page/pageSize，改页码重查）；
  - 操作：编辑（`user:update`）、重置密码（`user:reset-password`，小 Modal 输入新密码，成功 Toast 提示用户需重新登录）、禁用/启用（`user:update`，二次确认）；
  - 数据范围由后端决定，前端不额外过滤；ApiError 403 Toast"权限已变更，请刷新"。
- [ ] **Step 3: user-form.tsx** —— Modal：用户名（创建必填，编辑禁用）、初始密码（仅创建）、昵称、邮箱、所属部门 Select、**角色多选**（Select multiple/CheckboxGroup，角色来自 `GET /api/roles?systemId=<currentSystemId... ` 注意接口需要的是 system 的 **id**：从当前系统 menus/systems 里取 store.systems 找到 currentSystemCode 的 id）；编辑时 getUser 回填 roleIds；提交 create/update；409 Toast"用户名已存在"。
- [ ] **Step 4: 手工验证**：新建用户（验证 tester 视角只能看本部门）、编辑多角色、禁用后该用户 AT 下一次请求 401、重置密码。
- [ ] **Step 5: Commit** `feat(admin-web): users management with department and roles`

---

### Task 9: 角色管理（Roles Feature）

**Files:** `features/roles/{roles.api.ts,roles.page.tsx,role-form.tsx,menu-grant-tree.tsx}`、路由薄壳 `system/roles`

**Interfaces:**
- `listRoles(query: RoleListQuery): Promise<Paged<RoleDetail>>`
- `createRole(input: CreateRoleInput)`、`updateRole(id, input: UpdateRoleInput)`、`removeRole(id)`
- 角色作用域恒为当前系统（systemId 取自 store 当前系统 id）。

- [ ] **Step 1: api.ts** 实现上述函数。
- [ ] **Step 2: roles.page.tsx**：Table 列：名称、code、优先级、数据范围（Chip 映射 ALL=全部/DEPT_AND_SUB=本部门及以下/DEPT=本部门/SELF=仅本人）、状态、操作（编辑 `role:update`、删除 `role:delete`，409 Toast"角色已分配给用户"）；分页/keyword。
- [ ] **Step 3: menu-grant-tree.tsx**：数据 `GET /api/menus/tree?systemId=<id>`（加到 roles.api 或复用 `features/menus` 的 `getMenuTree(query)`）；自渲染缩进树 + HeroUI Checkbox：
  - 三态：全选/全不选/isIndeterminate（部分子选中）；点击节点：全选/全不选所有后代；父节点状态由子节点自动计算；DIR 节点也可勾选（其 id 同样提交）；
  - 输出 `menuIds: string[]`。
- [ ] **Step 4: role-form.tsx** —— Modal：名称、code（编辑禁用）、状态、priority（数字）、**dataScope Select（四选项中文）**、remark；下方菜单授权树；提交时 menuIds 随表单 create/update（update 走全量覆盖）；422（菜单跨系统等）显示 issues。
- [ ] **Step 5: 手工验证**：创建受限角色 → 挂给测试用户 → 该用户菜单/按钮立即按授权变化（整页加载/聚焦重拉后侧边栏更新；越权写操作 403）。
- [ ] **Step 6: Commit** `feat(admin-web): roles management with menu grant tree`

---

### Task 10: 菜单管理（Menus Feature）

**Files:** `features/menus/{menus.api.ts,menus.page.tsx,menu-form.tsx}`、路由薄壳 `system/menus`

**Interfaces:**
- `getMenuTree(query: MenuTreeQuery): Promise<MenuNode[]>` → GET `/api/menus/tree`
- `createMenu(input)`、`updateMenu(id, input)`、`removeMenu(id)`

- [ ] **Step 1: api.ts** 实现 4 个函数。
- [ ] **Step 2: menus.page.tsx**：缩进树表（depth 缩进），列：名称、类型（DIR=目录/MENU=菜单/BUTTON=按钮）、权限码、路径、组件、可见/状态、排序、操作（编辑/删除，409 Toast"存在子节点"）；新增按钮 `menu:create`。
- [ ] **Step 3: menu-form.tsx** —— Modal：systemId 固定当前系统；父节点 Select（本系统树拍平 + 顶级）；类型 Select（三态）；名称；路径；组件；图标；权限码；visible Switch；状态；排序。条件约束交给后端 422 展示（BUTTON 无路径、MENU 必填路径、权限码格式）。
- [ ] **Step 4: 手工验证** CRUD；新建带权限码的按钮节点后角色页可勾选。
- **Step 5: Commit** `feat(admin-web): menus management`

---

### Task 11: 系统管理（Systems Feature）

**Files:** `features/systems/{systems.api.ts,systems.page.tsx,system-form.tsx}`、路由薄壳 `system/systems`

**Interfaces:**
- `listSystems(): Promise<SystemDetail[]>` → GET `/api/systems`
- `createSystem(input)`、`updateSystem(id, input)`、`removeSystem(id)`

- [ ] **Step 1: api.ts**。
- [ ] **Step 2: systems.page.tsx**：Table 列：名称、code、状态、排序、操作（编辑/删除；409 Toast"系统下存在角色或菜单"）。
- [ ] **Step 3: system-form.tsx**：Modal 名称、code（编辑禁用）、状态、排序；409 Toast"code 已存在"。
- [ ] **Step 4: 手工验证** CRUD。
- **Step 5: Commit** `feat(admin-web): systems management`

---

### Task 12: 个人中心（改密 + 会话管理）

**Files:** `features/profile/{profile.api.ts,change-password.tsx,sessions.tsx}`、路由 `app/(admin)/profile/{page.tsx,sessions/page.tsx}`

**Interfaces:**
- `changePassword(input)` → POST `/api/auth/change-password`
- `listSessions(): Promise<SessionInfo[]>` → GET `/api/auth/sessions`
- `revokeSession(familyId)` → DELETE `/api/auth/sessions/:familyId`
- `logout()` → POST `/api/auth/logout`（复用）

- [ ] **Step 1: api.ts**。
- [ ] **Step 2: change-password.tsx**（profile/page.tsx 渲染）：Card + 旧密码/新密码/确认新密码（前端校验一致、≥8 位）；成功 Toast"密码已修改，其他设备已下线"；旧密码错误 401 内联提示。
- [ ] **Step 3: sessions.tsx**（profile/sessions/page.tsx）：Table 列：设备 UA、IP、最近使用、是否当前（Chip）；操作"下线"（当前项禁用）；成功后刷新；下线自己当前设备 → 提示并跳登录。
- [ ] **Step 4: 手工验证**：改密后另一浏览器会话 refresh 失效；远程下线立即生效。
- **Step 5: Commit** `feat(admin-web): profile, change password and sessions`

---

## Self-Review 记录

- Spec 6.1 覆盖：路由组（T3/T4）、引导 refresh→profile 与 loading（T4）、单飞刷新（T2）、聚焦节流重拉（T5）、403 提示（T8 起各页统一）。
- Spec 6.2 覆盖：侧边栏过滤（T4）、组件注册表（T6）、`<Can>`/usePermissions（T5）、Header 系统切换/登出（T4）。
- Spec 6.3 覆盖：登录（T3）、Dashboard（T4）、用户（T8）、角色（T9）、菜单（T10）、系统（T11）、部门（T7）、个人中心改密+会话（T12）。
- 类型一致性：apiFetch/refreshOnce/ApiError（T2 定义，后续 feature 全部经各自 api.ts 调用）；setSession/setProfile（T2，T4 切换系统消费）；registry key 与种子 component 字符串一致（system/users、profile/sessions 等）。
- 已知简化：表格内树形展示用缩进行而非虚拟树（无 Tree 组件）；401 单飞逻辑用模块级 Promise；Toast 使用 HeroUI 自带组件（T1 文档确认挂载方式）。
