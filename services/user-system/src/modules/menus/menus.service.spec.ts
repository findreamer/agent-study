import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenusService } from './menus.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

const actor = { id: 'u1', systemId: 'sys1' } as AuthUser;

function menuRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    systemId: 'sys1',
    parentId: null as string | null,
    type: 'MENU' as 'DIR' | 'MENU' | 'BUTTON',
    name: id,
    path: `/${id}`,
    component: null as string | null,
    icon: null,
    permissionCode: null as string | null,
    visible: true,
    status: 'ENABLED' as 'ENABLED' | 'DISABLED',
    sort: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function setup() {
  const rows: Record<string, ReturnType<typeof menuRow>> = {
    dir1: menuRow('dir1', { type: 'DIR', path: null }),
    m1: menuRow('m1', {
      parentId: 'dir1',
      permissionCode: 'user:list',
      component: 'system/users',
    }),
    b1: menuRow('b1', {
      parentId: 'm1',
      type: 'BUTTON',
      path: null,
      permissionCode: 'user:create',
    }),
  };

  const prisma = {
    menu: {
      findMany: vi.fn(async () => Object.values(rows)),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          rows[where.id] ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          where.parentId
            ? Object.values(rows).filter((m) => m.parentId === where.parentId)
                .length
            : 0,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        menuRow(`n-${data.name as string}`, data),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => ({ ...rows[where.id], ...data }),
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => rows[where.id]),
    },
    system: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'sys1' ? { id: 'sys1' } : null,
      ),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const root = values[0] as string;
      const tree: Record<string, string[]> = {
        dir1: ['dir1', 'm1', 'b1'],
        m1: ['m1', 'b1'],
      };
      return (tree[root] ?? [root]).map((id) => ({ id }));
    }),
  };

  const service = new MenusService(prisma as unknown as PrismaService);
  return { service, prisma };
}

const fullCreate = {
  systemId: 'sys1',
  parentId: 'dir1',
  type: 'MENU' as const,
  name: '新菜单',
  path: '/new',
  component: 'new-page',
  permissionCode: 'new:show',
  visible: true,
  sort: 0,
  status: 'ENABLED' as const,
};

describe('MenusService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('returns the full three-type tree for management', async () => {
    const tree = await ctx.service.tree({ systemId: 'sys1' });
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('dir1');
    const menu = tree[0].children?.[0];
    expect(menu?.children?.[0].type).toBe('BUTTON');
  });

  it('creates after validating system and parent membership', async () => {
    const created = await ctx.service.create(fullCreate);
    expect(created.path).toBe('/new');
    expect(ctx.prisma.menu.create).toHaveBeenCalledOnce();
  });

  it('rejects unknown system and foreign/missing parent (422)', async () => {
    ctx.prisma.system.findUnique.mockResolvedValue(null);
    await expect(
      ctx.service.create({ ...fullCreate, systemId: 'ghost' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    ctx.prisma.system.findUnique.mockResolvedValue({ id: 'sys1' });
    ctx.prisma.menu.findUnique.mockResolvedValue(
      menuRow('foreign', { systemId: 'other' }),
    );
    await expect(
      ctx.service.create({ ...fullCreate, parentId: 'foreign' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('maps duplicate permission code to 409', async () => {
    ctx.prisma.menu.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(ctx.service.create(fullCreate)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('404 on updating unknown menu and prevents cycles (422)', async () => {
    await expect(
      ctx.service.update('nope', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    // moving dir1 under its own descendant m1
    await expect(
      ctx.service.update('dir1', { parentId: 'm1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('updates a node with a valid same-system parent', async () => {
    const updated = await ctx.service.update('b1', { name: '改名' });
    expect(updated.name).toBe('改名');
  });

  it('blocks deleting a node with children, otherwise deletes', async () => {
    await expect(ctx.service.remove('m1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await ctx.service.remove('b1')).toEqual({ ok: true });
  });
});
