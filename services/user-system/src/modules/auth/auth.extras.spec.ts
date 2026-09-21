import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { PasswordService } from '../../common/auth/password.service.js';
import { TokenService } from '../../common/auth/token.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { PermissionsService } from '../../common/rbac/permissions.service.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

const authUser: AuthUser = {
  id: 'u1',
  username: 'alice',
  isSuperadmin: false,
  departmentId: null,
  systemId: 'sys1',
};

const fullUser = {
  id: 'u1',
  username: 'alice',
  passwordHash: 'old-hash',
  nickname: 'Alice',
  email: null,
  status: 'ACTIVE' as const,
  isSuperadmin: false,
  departmentId: null,
};

const system = {
  id: 'sys1',
  code: 'admin',
  name: '后台',
  status: 'ENABLED' as const,
  sort: 0,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

function setup() {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => fullUser),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
    },
    system: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.code === 'admin' || where.id === 'sys1') return system;
        return null;
      }),
    },
    refreshToken: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          where.familyId === 'fam-own' ? { familyId: 'fam-own' } : null,
      ),
    },
  };
  const tokens = {
    reissueAccessToken: vi.fn(async () => 'new-at'),
    touchFamilySystem: vi.fn(async () => undefined),
    listFamilies: vi.fn(async () => [
      { familyId: 'fam-own', current: true },
    ]),
    revokeFamilyById: vi.fn(async () => undefined),
    revokeOthers: vi.fn(async () => undefined),
  };
  const passwords = {
    verify: vi.fn(async () => true),
    hash: vi.fn(async () => 'new-hash'),
  };
  const audit = { log: vi.fn() };
  const permissions = {
    accessibleSystems: vi.fn(async () => [system]),
    getMenus: vi.fn(async () => []),
  };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
    audit as unknown as AuditService,
    permissions as unknown as PermissionsService,
  );

  return { service, prisma, tokens, passwords, audit, permissions };
}

describe('AuthService extras', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('profile builds from the current token system', async () => {
    const profile = await ctx.service.profile(authUser);
    expect(profile.currentSystemCode).toBe('admin');
    expect(ctx.permissions.getMenus).toHaveBeenCalledWith('u1', 'sys1', false);
  });

  it('switchSystem forbids an inaccessible system', async () => {
    ctx.permissions.accessibleSystems.mockResolvedValue([]);
    await expect(
      ctx.service.switchSystem(authUser, { systemCode: 'other' }, 'fam-own'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('switchSystem issues a new token and points the family at the system', async () => {
    const result = await ctx.service.switchSystem(
      authUser,
      { systemCode: 'admin' },
      'fam-own',
    );
    expect(result.accessToken).toBe('new-at');
    expect(ctx.tokens.touchFamilySystem).toHaveBeenCalledWith('fam-own', 'sys1');
    expect(result.profile.currentSystemCode).toBe('admin');
    expect(ctx.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'system_switched' }),
    );
  });

  it('sessions lists families marking the current one', async () => {
    const sessions = await ctx.service.sessions(authUser, 'fam-own');
    expect(sessions[0].current).toBe(true);
  });

  it('revokeSession 404 on an unknown/foreign family, revokes own', async () => {
    await expect(
      ctx.service.revokeSession(authUser, 'fam-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const result = await ctx.service.revokeSession(authUser, 'fam-own');
    expect(result).toEqual({ ok: true });
    expect(ctx.tokens.revokeFamilyById).toHaveBeenCalledWith('fam-own');
  });

  it('changePassword 401 on wrong old password', async () => {
    ctx.passwords.verify.mockResolvedValue(false);
    await expect(
      ctx.service.changePassword(authUser, {
        oldPassword: 'OldPass@1',
        newPassword: 'NewPass@123',
      }, 'fam-own'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changePassword updates the hash and revokes other families', async () => {
    const result = await ctx.service.changePassword(
      authUser,
      { oldPassword: 'OldPass@1', newPassword: 'NewPass@123' },
      'fam-own',
    );
    expect(result).toEqual({ ok: true });
    expect(ctx.passwords.hash).toHaveBeenCalledWith('NewPass@123');
    expect(ctx.tokens.revokeOthers).toHaveBeenCalledWith('u1', 'fam-own');
  });
});
