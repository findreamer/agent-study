import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemsService } from './systems.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

const actor = { id: 'u1', systemId: 'sys1' } as AuthUser;

function sysRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    code: id,
    name: id,
    status: 'ENABLED',
    sort: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function setup() {
  const rows: Record<string, ReturnType<typeof sysRow>> = { s1: sysRow('s1') };
  const prisma = {
    system: {
      findMany: vi.fn(async () => Object.values(rows)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        rows[where.id] ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        sysRow(`s-${data.code as string}`, data),
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
      delete: vi.fn(async ({ where }: { where: { id: string } }) =>
        rows[where.id],
      ),
    },
    role: { count: vi.fn(async () => 0) },
    menu: { count: vi.fn(async () => 0) },
  };
  const service = new SystemsService(prisma as unknown as PrismaService);
  return { service, prisma, rows };
}

describe('SystemsService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('lists all systems', async () => {
    const systems = await ctx.service.list();
    expect(systems).toHaveLength(1);
    expect(systems[0].createdAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('maps duplicate code to 409', async () => {
    ctx.prisma.system.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      ctx.service.create(actor, {
        code: 'dup',
        name: 'Dup',
        sort: 0,
        status: 'ENABLED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404 on updating or deleting missing system', async () => {
    await expect(
      ctx.service.update(actor, 'nope', { name: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctx.service.remove(actor, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('blocks deleting a system that owns roles or menus', async () => {
    ctx.prisma.role.count.mockResolvedValue(2);
    await expect(ctx.service.remove(actor, 's1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    ctx.prisma.role.count.mockResolvedValue(0);
    ctx.prisma.menu.count.mockResolvedValue(1);
    await expect(ctx.service.remove(actor, 's1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes a system without references', async () => {
    const result = await ctx.service.remove(actor, 's1');
    expect(result).toEqual({ ok: true });
  });
});
