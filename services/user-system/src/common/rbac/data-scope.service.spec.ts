import { describe, expect, it, vi } from 'vitest';
import { DataScopeService } from './data-scope.service.js';
import type { AuthUser } from '../auth/auth.constants.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  username: 'alice',
  isSuperadmin: false,
  departmentId: 'dept-1',
  systemId: 'sys1',
  ...over,
});

function prismaWithRoles(scopes: string[], descendants: string[] = ['dept-1', 'dept-2']) {
  return {
    role: {
      findMany: vi.fn(async () => scopes.map((dataScope) => ({ dataScope }))),
    },
    $queryRaw: vi.fn(async () => descendants.map((id) => ({ id }))),
  };
}

describe('DataScopeService.buildFilter', () => {
  it('returns empty filter for superadmin and ALL scope', async () => {
    const superSvc = new DataScopeService(prismaWithRoles([]) as never);
    expect(await superSvc.buildFilter(user({ isSuperadmin: true }), 'sys1')).toEqual({});

    const allSvc = new DataScopeService(prismaWithRoles(['ALL']) as never);
    expect(await allSvc.buildFilter(user(), 'sys1')).toEqual({});
  });

  it('DEPT_AND_SUB expands with recursive ids; DEPT uses own department', async () => {
    const sub = new DataScopeService(prismaWithRoles(['DEPT_AND_SUB']) as never);
    expect(await sub.buildFilter(user(), 'sys1')).toEqual({
      departmentId: { in: ['dept-1', 'dept-2'] },
    });

    const dept = new DataScopeService(prismaWithRoles(['DEPT']) as never);
    expect(await dept.buildFilter(user(), 'sys1')).toEqual({ departmentId: 'dept-1' });
  });

  it('SELF and no-department users degrade to self-only', async () => {
    const self = new DataScopeService(prismaWithRoles(['SELF']) as never);
    expect(await self.buildFilter(user(), 'sys1')).toEqual({ id: 'u1' });

    const noDept = new DataScopeService(prismaWithRoles(['DEPT']) as never);
    expect(await noDept.buildFilter(user({ departmentId: null }), 'sys1')).toEqual({ id: 'u1' });
  });

  it('takes the widest scope across multiple roles', async () => {
    const svc = new DataScopeService(prismaWithRoles(['SELF', 'DEPT', 'DEPT_AND_SUB']) as never);
    const filter = await svc.buildFilter(user(), 'sys1');
    expect(filter).toEqual({ departmentId: { in: ['dept-1', 'dept-2'] } });
  });
});
