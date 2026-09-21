import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepartmentsService } from './departments.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { DataScopeService } from '../../common/rbac/data-scope.service.js';

const dept = (id: string, parentId: string | null = null) => ({
  id,
  parentId,
  name: id,
  leader: null,
  sort: 0,
  status: 'ENABLED',
});

function mockPrisma(rows: Record<string, ReturnType<typeof dept>>) {
  return {
    department: {
      findMany: vi.fn(async () => Object.values(rows)),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null),
      create: vi.fn(
        async ({ data }: { data: { name: string; parentId?: string | null } }) =>
          dept(`new-${data.name}`, data.parentId ?? null),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => ({
          ...rows[where.id],
          ...data,
        }),
      ),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.parentId
          ? Object.values(rows).filter((d) => d.parentId === where.parentId).length
          : 0,
      ),
      delete: vi.fn(),
    },
    user: {
      count: vi.fn(async () => 0),
    },
  };
}

describe('DepartmentsService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: DepartmentsService;
  const dataScope = {
    getDepartmentAndDescendantIds: vi.fn(async (root: string) => {
      const tree: Record<string, string[]> = { a: ['a', 'b'], b: ['b'] };
      return tree[root] ?? [root];
    }),
  };

  beforeEach(() => {
    prisma = mockPrisma({ a: dept('a'), b: dept('b', 'a') });
    service = new DepartmentsService(
      prisma as unknown as PrismaService,
      dataScope as unknown as DataScopeService,
    );
  });

  it('returns the full department tree', async () => {
    const tree = await service.tree();
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children?.map((n) => n.id)).toEqual(['b']);
  });

  it('rejects deleting a department with children or users', async () => {
    prisma.user.count.mockResolvedValue(0);
    await expect(service.remove('a')).rejects.toBeInstanceOf(ConflictException);
    prisma.department.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(3);
    await expect(service.remove('a')).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents moving a node under itself or a descendant', async () => {
    await expect(
      service.update('a', { parentId: 'b' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates a child department', async () => {
    const created = await service.create({
      name: 'c',
      parentId: 'b',
      sort: 0,
      status: 'ENABLED',
    });
    expect(created.parentId).toBe('b');
  });
});
