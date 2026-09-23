# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** RBAC Admin
**Generated:** 2026-09-23 23:46:15
**Category:** SaaS (General)
**Design Dials:** Variance 3/10 (Centered / Minimal) | Motion 4/10 (Standard) | Density 8/10 (Dense / Dashboard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E40AF` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Primary Hover | `#1E3A8A` | `--color-primary-hover` |
| Secondary | `#F1F5F9` | `--color-secondary` |
| On Secondary | `#1E293B` | `--color-on-secondary` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#1E293B` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#1E293B` | `--color-card-foreground` |
| Muted | `#E2E8F0` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#E2E8F0` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#1E40AF` | `--color-ring` |

**Color Notes:** 用户指定：主色深蓝 #1E40AF，辅色浅灰系（slate）。深蓝之上白字对比度 8.6:1，满足 AAA。不再使用橙色 CTA。

### Typography

- **Heading Font:** Inter
- **Body Font:** Inter（fallback：系统字体栈 `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`）
- **Mood:** modern, saas, clean, professional
- **Google Fonts:** [Inter](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 8/10 — Dense / Dashboard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` / `0.125rem` | Tight gaps |
| `--space-sm` | `4px` / `0.25rem` | Icon gaps, inline spacing |
| `--space-md` | `8px` / `0.5rem` | Standard padding |
| `--space-lg` | `12px` / `0.75rem` | Section padding |
| `--space-xl` | `16px` / `1rem` | Large gaps |
| `--space-2xl` | `24px` / `1.5rem` | Section margins |
| `--space-3xl` | `32px` / `2rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #1E40AF;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  background: #1E3A8A;
}

/* Secondary Button */
.btn-secondary {
  background: #F1F5F9;
  color: #1E293B;
  border: 1px solid #E2E8F0;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E40AF;
  outline: none;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.15);
}
```

### Drawer（表单弹窗，右侧滑入）

用户指定：**所有表单使用 Drawer（从右侧滑入），不使用居中 Modal**。

- 宽度：480px（简单表单）至 640px（含授权树等复杂表单），最小 420px
- 动效：slide-in from right 240ms ease-out，退出 180ms（退出更快）；遮罩 rgba(15,23,42,0.4)
- 结构：固定 Header（标题 + 关闭按钮）、可滚动 Body、固定 Footer（取消 + 主操作按钮，主操作 loading 态禁用）
- 无障碍：Esc 可关闭；焦点进入 Drawer；关闭按钮 aria-label="关闭"

```css
.drawer-overlay {
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(2px);
}

.drawer {
  background: white;
  height: 100dvh;
  width: min(480px, 100vw);
  right: 0;
  box-shadow: var(--shadow-xl);
}
```

### Sidebar（固定 272px）

用户指定：**侧边栏固定宽 272px，图标 + 文字菜单，根据后端菜单动态渲染**。

- 布局：`w-[272px] fixed inset-y-0 left-0`，内容区 `pl-[272px]`
- 项结构：图标（20px，Heroicons/Lucide 线性风格）+ 文字，高度 40px，左缩进 12px，圆角 6px
- 激活态：`bg-primary/10 text-primary font-medium` + 左侧 3px 主色指示条
- 分组：DIR 节点渲染为分组标题（12px 大写、muted 色），MENU 节点为可点击项
- 折叠：本期不实现折叠态

```css
.sidebar {
  width: 272px;
  border-right: 1px solid #E2E8F0;
  background: #FFFFFF;
}

.nav-item.is-active {
  background: rgba(30, 64, 175, 0.08);
  color: #1E40AF;
  font-weight: 500;
}
```

### 权限分配 Checkbox 树

用户指定：**权限分配使用 Checkbox 树形结构，按 系统 / 菜单 / 权限 分组**。

- 三级：系统（顶部分组）→ 菜单/目录 → 按钮/权限码
- 三态：全选 / 全不选 / isIndeterminate（部分选中）；父节点状态由子节点聚合
- 勾选父节点 = 勾选全部后代；显示权限码（等宽字体、muted 色）

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Admin Console Shell（后台管理 Shell）

- **布局：** 固定 272px 左侧 Sidebar + 右侧内容区（Top Header 56px：面包屑/系统切换/用户菜单 + 可滚动 main）
- **内容区：** `bg-background`，页面卡片 `bg-white rounded-lg border border-border`；页头含标题 + 主操作按钮（右侧）
- **表格页：** 筛选区（搜索框 + 下拉 + 查询按钮）→ 表格 → 底部右侧分页
- **表格：** 带分页、搜索和行级操作（行尾 Dropdown/按钮组：编辑、禁用、删除等）
- **表单：** 一律右侧 Drawer（见 Drawer 规范），不使用居中 Modal

---

## Motion

**原则（后台场景）：** 仅使用 CSS transition（150-250ms）与 HeroUI 组件内置动效，不引入 GSAP。Drawer 滑入 240ms / 滑出 180ms；表格与列表不做入场动画；所有动效尊重 `prefers-reduced-motion`。

---

## Anti-Patterns (Do NOT Use)

- ❌ Excessive animation
- ❌ Dark mode by default

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
