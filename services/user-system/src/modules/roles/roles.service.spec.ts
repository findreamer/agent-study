import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesService } from './roles.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

const actor = { id: 'u1', systemId: 'sys1' } as AuthUser;

function roleRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    systemId: 'sys1',
    code: id,
    name: id,
    status: 'ENABLED',
    priority: 100,
    dataScope: 'SELF',
    remark: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function setup() {
  const rows: Record<string, ReturnType<typeof roleRow>> = {
    r1: roleRow('r1'),
  };

  const txRole = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
      roleRow(`r-${data.code as string}`, data),
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
  };
  const txRoleMenu = {
    createMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };

  const prisma = {
    role: {
      findMany: vi.fn(async () => [{ ...rows.r1, menus: [{ menuId: 'm1' }] }]),
      count: vi.fn(async () => Object.keys(rows).length),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        rows[where.id] ?? null,
      ),
      create: txRole.create,
      update: txRole.update,
      delete: vi.fn(async ({ where }: { where: { id: string } }) => rows[where.id]),
    },
    menu: {
      count: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.length,
      ),
    },
    system: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'sys1' ? { id: 'sys1' } : null,
      ),
    },
    userRole: {
      count: vi.fn(async () => 0),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ role: txRole, roleMenu: txRoleMenu }),
    ),
  };

  const service = new RolesService(prisma as unknown as PrismaService);
  return { service, prisma, txRoleMenu };
}

const baseCreate = {
  systemId: 'sys1',
  code: 'auditor',
  name: '审计员',
  status: 'ENABLED' as const,
  priority: 50,
  dataScope: 'SELF' as const,
  menuIds: ['m1', 'm2'],
};

describe('RolesService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('lists roles for a system with granted menu ids', async () => {
    const result = await ctx.service.list(actor, {
      systemId: 'sys1',
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0].menuIds).toEqual(['m1']);
    expect(result.total).toBe(1);
  });

  it('creates a role and its menu grants in a transaction after validation', async () => {
    const created = await ctx.service.create(actor, baseCreate);
    expect(created.code).toBe('auditor');
    expect(created.menuIds).toEqual(['m1', 'm2']);
    expect(ctx.txRoleMenu.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: 'r-auditor', menuId: 'm1' },
        { roleId: 'r-auditor', menuId: 'm2' },
      ],
    });
  });

  it('rejects menus that do not belong to the system (422)', async () => {
    ctx.prisma.menu.count.mockResolvedValue(1);
    await expect(ctx.service.create(actor, baseCreate)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects unknown system and duplicate code', async () => {
    ctx.prisma.system.findUnique.mockResolvedValue(null);
    await expect(
      ctx.service.create(actor, { ...baseCreate, systemId: 'ghost' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    ctx.prisma.system.findUnique.mockResolvedValue({ id: 'sys1' });
    ctx.prisma.role.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(ctx.service.create(actor, baseCreate)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('overwrites menu grants on update and keeps system fixed', async () => {
    const updated = await ctx.service.update(actor, 'r1', {
      menuIds: ['m9'],
    });
    expect(ctx.txRoleMenu.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'r1' },
    });
    expect(ctx.txRoleMenu.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r1', menuId: 'm9' }],
    });
    expect(updated.menuIds).toEqual(['m9']);
  });

  it('404 on updating unknown role and 422 on cross-system menus', async () => {
    await expect(
      ctx.service.update(actor, 'nope', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    ctx.prisma.menu.count.mockResolvedValue(0);
    await expect(
      ctx.service.update(actor, 'r1', { menuIds: ['mx'] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks deleting a role still assigned to users, otherwise deletes', async () => {
    ctx.prisma.userRole.count.mockResolvedValue(1);
    await expect(ctx.service.remove(actor, 'r1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    ctx.prisma.userRole.count.mockResolvedValue(0);
    expect(await ctx.service.remove(actor, 'r1')).toEqual({ ok: true });
  });
});
