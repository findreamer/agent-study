import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { System } from '@agent-study/database/prisma';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type {
  LoginInput,
  ProfileResponse,
  SystemBrief,
} from '@agent-study/contracts';
import { AuditService } from '../../common/audit/audit.service.js';
import { PasswordService } from '../../common/auth/password.service.js';
import { TokenService } from '../../common/auth/token.service.js';
import type { TokenContext } from '../../common/auth/auth.constants.js';
import { buildTree } from '../../common/rbac/build-tree.js';
import {
  PermissionsService,
  toMenuNode,
} from '../../common/rbac/permissions.service.js';

interface LoginUser {
  id: string;
  username: string;
  passwordHash: string;
  nickname: string;
  email: string | null;
  status: 'ACTIVE' | 'DISABLED';
  isSuperadmin: boolean;
  departmentId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  private toSystemBrief(system: System): SystemBrief {
    return {
      id: system.id,
      code: system.code,
      name: system.name,
      status: system.status,
      sort: system.sort,
    };
  }

  async buildProfile(user: LoginUser, system: System): Promise<ProfileResponse> {
    const [systems, flatMenus] = await Promise.all([
      this.permissions.accessibleSystems(user.id, user.isSuperadmin),
      this.permissions.getMenus(user.id, system.id, user.isSuperadmin),
    ]);
    return {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        status: user.status,
        isSuperadmin: user.isSuperadmin,
        departmentId: user.departmentId,
      },
      currentSystemCode: system.code,
      systems: systems.map(this.toSystemBrief),
      menus: buildTree(flatMenus.map(toMenuNode)),
      permissions: [
        ...new Set(
          flatMenus
            .map((m) => m.permissionCode)
            .filter((code): code is string => Boolean(code)),
        ),
      ],
    };
  }

  async login(
    input: LoginInput,
    ctx: TokenContext,
  ): Promise<{ accessToken: string; refreshToken: string; profile: ProfileResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
    });

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await this.passwords.verify(user.passwordHash, input.password))
    ) {
      this.audit.log({
        event: 'login_failed',
        targetType: 'user',
        targetId: user?.id,
        ip: ctx.ip ?? undefined,
        ua: ctx.ua ?? undefined,
      });
      throw new UnauthorizedException('invalid credentials');
    }

    const systems = await this.permissions.accessibleSystems(
      user.id,
      user.isSuperadmin,
    );
    if (systems.length === 0) {
      throw new ForbiddenException('no accessible system');
    }
    const defaultSystem =
      (user.isSuperadmin && systems.find((s) => s.code === 'admin')) || systems[0];

    const { accessToken, refreshToken } = await this.tokens.issueFamily(
      { id: user.id, username: user.username, isSuperadmin: user.isSuperadmin },
      defaultSystem.id,
      ctx,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const profile = await this.buildProfile(user, defaultSystem);

    this.audit.log({
      event: 'login_succeeded',
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      ip: ctx.ip ?? undefined,
      ua: ctx.ua ?? undefined,
    });

    return { accessToken, refreshToken, profile };
  }
}
