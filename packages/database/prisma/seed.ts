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
const profileDir = await menu({ type: 'DIR', name: '个人中心', icon: 'user-circle', sort: 2 });

async function pageWithButtons(
  parent: { id: string },
  sort: number,
  page: { name: string; path: string; component: string; code: string; icon: string },
  buttonCodes: string[],
) {
  const pageNode = await menu({
    parentId: parent.id,
    type: 'MENU',
    name: page.name,
    path: page.path,
    component: page.component,
    icon: page.icon,
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

await pageWithButtons(sysDir, 1, {
  name: '用户管理',
  path: '/users',
  component: 'users',
  code: 'user:list',
  icon: 'users',
}, [
  'user:create',
  'user:update',
  'user:delete',
  'user:reset-password',
  // 部门管理并入用户页：这些按钮码保护 departments 接口
  'dept:list',
  'department:create',
  'department:update',
  'department:delete',
]);

await pageWithButtons(sysDir, 2, {
  name: '角色管理',
  path: '/roles',
  component: 'roles',
  code: 'role:list',
  icon: 'key-round',
}, ['role:create', 'role:update', 'role:delete']);

await pageWithButtons(sysDir, 3, {
  name: '权限配置中心',
  path: '/permission-center',
  component: 'permission-center',
  code: 'menu:list',
  icon: 'shield-check',
}, ['menu:create', 'menu:update', 'menu:delete']);

await menu({
  parentId: profileDir.id,
  type: 'MENU',
  name: '个人信息',
  path: '/profile',
  component: 'profile',
  icon: 'user-circle',
  sort: 1,
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

// 用户查看 + 用户编辑 + 部门查看/维护（部门管理并入用户页）
const grantCodes = ['user:list', 'user:update', 'dept:list', 'department:create', 'department:update'];
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
