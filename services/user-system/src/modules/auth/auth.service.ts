import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Menu, System } from '@agent-study/database/prisma';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { LoginInput, MenuNode, ProfileResponse, SystemBrief } from '@agent-study/contracts';
import { AuditService } from '../../common/audit/audit.service.js';
import { PasswordService } from '../../common/auth/password.service.js';
import { TokenService } from '../../common/auth/token.service.js';
import type { TokenContext } from '../../common/auth/auth.constants.js';
import { buildTree } from '../../common/rbac/build-tree.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
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

  private async accessibleSystems(
    userId: string,
    isSuperadmin: boolean,
  ): Promise<System[]> {
    if (isSuperadmin) {
      return this.prisma.system.findMany({
        where: { status: 'ENABLED' },
        orderBy: { sort: 'asc' },
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                status: true,
                system: true,
              },
            },
          },
        },
      },
    });
    const systems = new Map<string, System>();
    for (const { role } of user?.roles ?? []) {
      if (role.status === 'ENABLED' && role.system.status === 'ENABLED') {
        systems.set(role.system.id, role.system);
      }
    }
    return [...systems.values()].sort((a, b) => a.sort - b.sort);
  }

  private async menusForSystem(
    userId: string,
    systemId: string,
    isSuperadmin: boolean,
  ) {
    if (isSuperadmin) {
      return this.prisma.menu.findMany({
        where: { systemId, status: 'ENABLED' },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                status: true,
                systemId: true,
                menus: { select: { menu: true } },
              },
            },
          },
        },
      },
    });
    const menus = new Map<string, Menu>();
    for (const { role } of user?.roles ?? []) {
      if (role.status !== 'ENABLED' || role.systemId !== systemId) continue;
      for (const { menu } of role.menus) {
        if (menu.status === 'ENABLED') menus.set(menu.id, menu);
      }
    }
    return [...menus.values()].sort(
      (a, b) => a.sort - b.sort || a.id.localeCompare(b.id),
    );
  }

  private toMenuNode(menu: Awaited<ReturnType<AuthService['menusForSystem']>>[number]): MenuNode {
    return {
      id: menu.id,
      parentId: menu.parentId,
      type: menu.type,
      name: menu.name,
      path: menu.path,
      component: menu.component,
      icon: menu.icon,
      permissionCode: menu.permissionCode,
      visible: menu.visible,
      status: menu.status,
      sort: menu.sort,
    };
  }

  async buildProfile(
    user: { id: string; username: string; nickname: string; email: string | null; status: string; isSuperadmin: boolean; departmentId: string | null },
    system: System,
  ): Promise<ProfileResponse> {
    const systems = await this.accessibleSystems(user.id, user.isSuperadmin);
    const flatMenus = await this.menusForSystem(user.id, system.id, user.isSuperadmin);
    return {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        status: user.status as ProfileResponse['user']['status'],
        isSuperadmin: user.isSuperadmin,
        departmentId: user.departmentId,
      },
      currentSystemCode: system.code,
      systems: systems.map(this.toSystemBrief),
      menus: buildTree(flatMenus.map((m) => this.toMenuNode(m))),
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

    const systems = await this.accessibleSystems(user.id, user.isSuperadmin);
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
