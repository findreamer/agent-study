import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from './permissions.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const menu = (over: Record<string, unknown>) => ({
  id: over.id as string,
  parentId: null,
  type: 'BUTTON',
  name: over.name ?? 'btn',
  path: null,
  component: null,
  icon: null,
  permissionCode: (over.permissionCode as string | null) ?? null,
  visible: true,
  status: 'ENABLED',
  sort: 0,
});

function prismaWithRoles(roles: unknown[], systems: unknown[] = []) {
  return {
    user: {
      findUnique: vi.fn(async () => ({ roles })),
    },
    system: {
      findMany: vi.fn(async () => systems),
    },
    menu: {
      findMany: vi.fn(async () => [
        menu({ id: 'm-super', name: 'all', permissionCode: 'system:create' }),
      ]),
    },
  };
}

const grantedRole = (systemId: string, codes: Array<string | null>, extra: Record<string, unknown> = {}) => ({
  role: {
    status: 'ENABLED',
    systemId,
    system: { id: systemId, code: systemId, name: systemId, status: 'ENABLED', sort: 0 },
    menus: codes.map((code) => ({ menu: menu({ id: `m-${code ?? 'null'}`, permissionCode: code }) })),
    ...extra,
  },
});

describe('PermissionsService', () => {
  it('unions permission codes across enabled roles and dedupes', async () => {
    const prisma = prismaWithRoles([
      grantedRole('sys1', ['user:list', 'user:create']),
      grantedRole('sys1', ['user:list', 'role:list']),
    ]);
    const service = new PermissionsService(prisma as unknown as PrismaService);
    const codes = await service.getCodes('u1', 'sys1');
    expect(codes.sort()).toEqual(['role:list', 'user:create', 'user:list']);
  });

  it('excludes disabled roles, disabled menus and other systems', async () => {
    const prisma = prismaWithRoles([
      grantedRole('sys1', ['user:list']),
      grantedRole('sys1', ['user:create'], { status: 'DISABLED' }),
      grantedRole('sys2', ['system:delete']),
    ]);
    // disable one granted menu
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      roles: [
        {
          role: {
            status: 'ENABLED',
            systemId: 'sys1',
            system: { id: 'sys1', code: 'sys1', name: 'sys1', status: 'ENABLED', sort: 0 },
            menus: [
              { menu: menu({ id: 'm1', permissionCode: 'user:list' }) },
              { menu: { ...menu({ id: 'm2', permissionCode: 'user:update' }), status: 'DISABLED' } },
            ],
          },
        },
        grantedRole('sys2', ['system:delete']),
      ],
    });
    const service = new PermissionsService(prisma as unknown as PrismaService);
    expect(await service.getCodes('u1', 'sys1')).toEqual(['user:list']);
  });

  it('returns every enabled system for superadmin', async () => {
    const systems = [
      { id: 'sys1', code: 'admin', name: 'a', status: 'ENABLED', sort: 1 },
      { id: 'sys2', code: 'chat', name: 'b', status: 'ENABLED', sort: 0 },
    ];
    const service = new PermissionsService(prismaWithRoles([], systems) as unknown as PrismaService);
    const result = await service.accessibleSystems('u1', true);
    expect(result.map((s) => s.id)).toEqual(['sys1', 'sys2']);
  });
});
