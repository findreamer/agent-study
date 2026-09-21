import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { PasswordService } from '../../common/auth/password.service.js';
import { TokenService } from '../../common/auth/token.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import type { PermissionsService } from '../../common/rbac/permissions.service.js';

const ctx = { ua: 'vitest', ip: '127.0.0.1' };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    username: 'alice',
    passwordHash: 'hash',
    nickname: 'Alice',
    email: null,
    status: 'ACTIVE',
    isSuperadmin: false,
    departmentId: null,
    ...overrides,
  };
}

function mockPrisma(user: ReturnType<typeof makeUser> | null) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.username ? user : user ? { roles: [] } : null,
      ),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
    },
  };
}

const adminSystem = {
  id: 'sys-admin',
  code: 'admin',
  name: '后台管理',
  status: 'ENABLED',
  sort: 0,
};

describe('AuthService.login', () => {
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let tokenService: { issueFamily: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };
  let permissions: {
    accessibleSystems: ReturnType<typeof vi.fn>;
    getMenus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    passwords = { verify: vi.fn(async () => true) };
    tokenService = {
      issueFamily: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt' })),
    };
    audit = { log: vi.fn() };
    permissions = {
      accessibleSystems: vi.fn(async () => [adminSystem]),
      getMenus: vi.fn(async () => []),
    };
  });

  const makeService = (prisma: unknown, superadmin = false) =>
    new AuthService(
      prisma as never,
      passwords as unknown as PasswordService,
      tokenService as unknown as TokenService,
      audit as unknown as AuditService,
      {
        accessibleSystems: permissions.accessibleSystems,
        getMenus: permissions.getMenus,
      } as unknown as PermissionsService,
    );

  it('throws identical 401 for unknown username and audits failure', async () => {
    const service = makeService(mockPrisma(null));
    await expect(
      service.login({ username: 'ghost', password: 'Admin@123456' }, ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login_failed' }),
    );
  });

  it('throws 401 for wrong password and disabled users', async () => {
    passwords.verify.mockResolvedValue(false);
    const wrongPw = makeService(mockPrisma(makeUser()));
    await expect(
      wrongPw.login({ username: 'alice', password: 'nope-nope' }, ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    passwords.verify.mockResolvedValue(true);
    const disabled = makeService(mockPrisma(makeUser({ status: 'DISABLED' })));
    await expect(
      disabled.login({ username: 'alice', password: 'Admin@123456' }, ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 403 when the user has no accessible system', async () => {
    permissions.accessibleSystems.mockResolvedValue([]);
    const service = makeService(mockPrisma(makeUser()));
    await expect(
      service.login({ username: 'alice', password: 'Admin@123456' }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs in and returns tokens plus profile, defaulting superadmin to admin system', async () => {
    const user = makeUser({ isSuperadmin: true });
    const service = makeService(mockPrisma(user), true);
    const result = await service.login(
      { username: 'alice', password: 'Admin@123456' },
      ctx,
    );
    expect(result.accessToken).toBe('at');
    expect(result.refreshToken).toBe('rt');
    expect(result.profile.currentSystemCode).toBe('admin');
    expect(result.profile.systems).toHaveLength(1);
    expect(result.profile.permissions).toEqual([]);
    expect(tokenService.issueFamily).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      'sys-admin',
      ctx,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login_succeeded' }),
    );
  });
});
