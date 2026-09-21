import { PrismaClient } from '../src/generated/client/index.js';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ADMIN_CODE = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';

type AnyRecord = Record<string, unknown>;

async function findOrCreate<T extends AnyRecord>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find();
  return existing ?? create();
}

// ---- System ---------------------------------------------------------------

const adminSystem = await prisma.system.upsert({
  where: { code: 'admin' },
  update: { name: '后台管理系统' },
  create: { code: 'admin', name: '后台管理系统', sort: 0 },
});

// ---- Departments: 总部 / 研发中心(前端组,后端组) / 市场部 ------------------

const hq = await findOrCreate(
  () => prisma.department.findFirst({ where: { name: '总部', parentId: null } }),
  () => prisma.department.create({ data: { name: '总部', sort: 0 } }),
);

const rd = await findOrCreate(
  () => prisma.department.findFirst({ where: { name: '研发中心', parentId: hq.id } }),
  () => prisma.department.create({ data: { name: '研发中心', parentId: hq.id, sort: 1 } }),
);

const marketing = await findOrCreate(
  () => prisma.department.findFirst({ where: { name: '市场部', parentId: hq.id } }),
  () => prisma.department.create({ data: { name: '市场部', parentId: hq.id, sort: 2 } }),
);

const frontend = await findOrCreate(
  () => prisma.department.findFirst({ where: { name: '前端组', parentId: rd.id } }),
  () => prisma.department.create({ data: { name: '前端组', parentId: rd.id, sort: 1 } }),
);

const backend = await findOrCreate(
  () => prisma.department.findFirst({ where: { name: '后端组', parentId: rd.id } }),
  () => prisma.department.create({ data: { name: '后端组', parentId: rd.id, sort: 2 } }),
);

// ---- Menu tree --------------------------------------------------------------

type MenuInput = {
  parentId?: string | null;
  type: 'DIR' | 'MENU' | 'BUTTON';
  name: string;
  path?: string | null;
  component?: string | null;
  icon?: string | null;
  permissionCode?: string | null;
  visible?: boolean;
  sort: number;
};

async function menu(input: MenuInput) {
  const base = {
    systemId: adminSystem.id,
    parentId: input.parentId ?? null,
    type: input.type,
    name: input.name,
    path: input.path ?? null,
    component: input.component ?? null,
    icon: input.icon ?? null,
    permissionCode: input.permissionCode ?? null,
    visible: input.visible ?? true,
    sort: input.sort,
  } as const;

  return findOrCreate(
    () =>
      input.permissionCode
        ? prisma.menu.findFirst({ where: { systemId: adminSystem.id, permissionCode: input.permissionCode } })
        : prisma.menu.findFirst({
            where: { systemId: adminSystem.id, parentId: base.parentId, name: input.name },
          }),
    () => prisma.menu.create({ data: base }),
  );
}

const sysDir = await menu({ type: 'DIR', name: '系统管理', icon: 'settings', sort: 1 });
const profileDir = await menu({ type: 'DIR', name: '个人中心', icon: 'user', sort: 2 });

async function pageWithButtons(
  sort: number,
  page: { name: string; path: string; component: string; code: string },
  buttonCodes: string[],
) {
  const pageNode = await menu({
    parentId: sysDir.id,
    type: 'MENU',
    name: page.name,
    path: page.path,
    component: page.component,
    permissionCode: page.code,
    sort,
  });
  for (const [i, code] of buttonCodes.entries()) {
    const [, action] = code.split(':');
    await menu({
      parentId: pageNode.id,
      type: 'BUTTON',
      name: action,
      permissionCode: code,
      visible: false,
      sort: i + 1,
    });
  }
  return pageNode;
}

const usersPage = await pageWithButtons(1, {
  name: '用户管理',
  path: '/system/users',
  component: 'system/users',
  code: 'user:list',
}, ['user:create', 'user:update', 'user:delete', 'user:reset-password']);

const rolesPage = await pageWithButtons(2, {
  name: '角色管理',
  path: '/system/roles',
  component: 'system/roles',
  code: 'role:list',
}, ['role:create', 'role:update', 'role:delete']);

const menusPage = await pageWithButtons(3, {
  name: '菜单管理',
  path: '/system/menus',
  component: 'system/menus',
  code: 'menu:list',
}, ['menu:create', 'menu:update', 'menu:delete']);

const deptsPage = await pageWithButtons(4, {
  name: '部门管理',
  path: '/system/departments',
  component: 'system/departments',
  code: 'dept:list',
}, ['department:create', 'department:update', 'department:delete']);

const systemsPage = await pageWithButtons(5, {
  name: '系统管理',
  path: '/system/systems',
  component: 'system/systems',
  code: 'system:list',
}, ['system:create', 'system:update', 'system:delete']);

await menu({
  parentId: profileDir.id,
  type: 'MENU',
  name: '个人信息',
  path: '/profile',
  component: 'profile',
  sort: 1,
});
await menu({
  parentId: profileDir.id,
  type: 'MENU',
  name: '会话管理',
  path: '/profile/sessions',
  component: 'profile/sessions',
  sort: 2,
});

// ---- Users -------------------------------------------------------------------

const admin = await prisma.user.upsert({
  where: { username: ADMIN_CODE },
  update: {
    passwordHash: await hash(ADMIN_PASSWORD),
    departmentId: hq.id,
    isSuperadmin: true,
    status: 'ACTIVE',
  },
  create: {
    username: ADMIN_CODE,
    passwordHash: await hash(ADMIN_PASSWORD),
    nickname: '超级管理员',
    departmentId: hq.id,
    isSuperadmin: true,
  },
});

const deptManager = await prisma.role.upsert({
  where: { systemId_code: { systemId: adminSystem.id, code: 'dept-manager' } },
  update: { name: '部门管理员', dataScope: 'DEPT', priority: 100 },
  create: {
    systemId: adminSystem.id,
    code: 'dept-manager',
    name: '部门管理员',
    dataScope: 'DEPT',
    priority: 100,
  },
});

// 用户查看 + 用户编辑 + 部门查看
const grantCodes = ['user:list', 'user:update', 'dept:list'];
const grantedMenus = await prisma.menu.findMany({
  where: { systemId: adminSystem.id, permissionCode: { in: grantCodes } },
  select: { id: true },
});
await prisma.roleMenu.deleteMany({ where: { roleId: deptManager.id } });
if (grantedMenus.length > 0) {
  await prisma.roleMenu.createMany({
    data: grantedMenus.map((m) => ({ roleId: deptManager.id, menuId: m.id })),
  });
}

const tester = await prisma.user.upsert({
  where: { username: 'tester' },
  update: {
    passwordHash: await hash('Test@123456'),
    departmentId: backend.id,
    status: 'ACTIVE',
  },
  create: {
    username: 'tester',
    passwordHash: await hash('Test@123456'),
    nickname: '测试用户',
    departmentId: backend.id,
  },
});

await prisma.userRole.upsert({
  where: { userId_roleId: { userId: tester.id, roleId: deptManager.id } },
  update: {},
  create: { userId: tester.id, roleId: deptManager.id },
});

console.log('Seed complete:', {
  system: adminSystem.code,
  departments: 5,
  admin: admin.username,
  role: deptManager.code,
  tester: tester.username,
});
await prisma.$disconnect();
