import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { PasswordService } from '../../common/auth/password.service.js';
import type { TokenService } from '../../common/auth/token.service.js';
import type { DataScopeService } from '../../common/rbac/data-scope.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

const actor: AuthUser = {
  id: 'u1',
  username: 'alice',
  isSuperadmin: false,
  departmentId: 'dept-1',
  systemId: 'sys1',
};

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    username: id,
    passwordHash: 'secret-hash',
    nickname: id,
    email: null,
    status: 'ACTIVE',
    isSuperadmin: false,
    departmentId: 'dept-1',
    roles: [] as Array<{ roleId: string }>,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function setup() {
  const rows: Record<string, ReturnType<typeof row>> = {
    u1: row('u1'),
    u2: row('u2'),
  };

  const listWhere = vi.fn();
  const prisma = {
    user: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        listWhere(args.where);
        return Object.values(rows).filter((r) => !r.passwordHash.includes('__omit__'));
      }),
      count: vi.fn(async () => Object.keys(rows).length),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; AND?: unknown[] };
        }) => {
          if (!where.AND) return rows[where.id ?? ''] ?? null;
          const [idClause, scopeClause] = where.AND as [
            { id: string },
            Record<string, unknown>,
          ];
          const candidate = rows[idClause.id];
        if (!candidate) return null;
        // scope {} means unrestricted; { id } or { departmentId: ... } narrows
        if ('id' in scopeClause && scopeClause.id !== candidate.id) return null;
        if (
          'departmentId' in scopeClause &&
          JSON.stringify(scopeClause.departmentId) !==
            JSON.stringify({ in: [candidate.departmentId] }) &&
          scopeClause.departmentId !== candidate.departmentId
        ) {
          return null;
        }
        return candidate;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = row(data.username as string, {
          passwordHash: data.passwordHash as string,
          roles: [],
        });
        rows[created.id] = created;
        return created;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          rows[where.id] = { ...rows[where.id], ...data };
          return rows[where.id];
        },
      ),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        user: {
          ...prisma.user,
          findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
            rows[where.id] ? { id: where.id } : null,
          ),
        },
        userRole: {
          deleteMany: vi.fn(async () => ({ count: 0 })),
          createMany: vi.fn(async () => ({ count: 0 })),
        },
      }),
    ),
  };

  const passwords = {
    hash: vi.fn(async () => 'fresh-hash'),
  };
  const tokens = {
    revokeAllFamilies: vi.fn(async () => undefined),
  };
  const dataScope = {
    buildFilter: vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        departmentId: { in: ['dept-1'] },
      }),
    ),
  };

  const service = new UsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    dataScope as unknown as DataScopeService,
  );

  return { service, prisma, passwords, tokens, dataScope, listWhere, rows };
}

describe('UsersService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('lists users merging data scope, keyword and department filters', async () => {
    const result = await ctx.service.list(actor, {
      page: 1,
      pageSize: 20,
      keyword: 'alice',
      departmentId: 'dept-9',
    });
    expect(ctx.dataScope.buildFilter).toHaveBeenCalledWith(actor, 'sys1');
    const where = ctx.listWhere.mock.calls[0][0] as { AND: unknown[] };
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { departmentId: 'dept-9' },
        { OR: expect.any(Array) },
        { departmentId: { in: ['dept-1'] } },
      ]),
    );
    expect(result.total).toBe(2);
    expect(result.items[0]).not.toHaveProperty('passwordHash');
  });

  it('returns 404 for detail outside the data scope', async () => {
    ctx.dataScope.buildFilter.mockResolvedValue({ id: 'u1' });
    await expect(ctx.service.detail(actor, 'u2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns detail with role ids in scope', async () => {
    ctx.dataScope.buildFilter.mockResolvedValue({});
    ctx.rows.u1.roles = [{ roleId: 'r1' }, { roleId: 'r2' }];
    const detail = await ctx.service.detail(actor, 'u1');
    expect(detail.roleIds).toEqual(['r1', 'r2']);
    expect(detail).not.toHaveProperty('passwordHash');
  });

  it('creates a user with hashed password and roles in a transaction', async () => {
    const created = await ctx.service.create(actor, {
      username: 'bob01',
      password: 'Admin@123456',
      nickname: 'Bob',
      roleIds: ['r1'],
    });
    expect(ctx.passwords.hash).toHaveBeenCalledWith('Admin@123456');
    expect(created.username).toBe('bob01');
    expect(ctx.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('maps duplicate username to 409', async () => {
    ctx.prisma.user.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      ctx.service.create(actor, {
        username: 'dup01',
        password: 'Admin@123456',
        nickname: 'Dup',
        roleIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('revokes all refresh families when disabling a user', async () => {
    await ctx.service.update(actor, 'u2', { status: 'DISABLED' });
    expect(ctx.tokens.revokeAllFamilies).toHaveBeenCalledWith('u2');
  });

  it('resets password and revokes families', async () => {
    const result = await ctx.service.resetPassword(actor, 'u2', {
      newPassword: 'NewPass@123',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(ctx.tokens.revokeAllFamilies).toHaveBeenCalledWith('u2');
  });
});
