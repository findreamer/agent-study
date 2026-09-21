import { Injectable } from '@nestjs/common';
import type { Menu, System } from '@agent-study/database/prisma';
import type { MenuNode } from '@agent-study/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildTree } from './build-tree.js';

export function toMenuNode(menu: Menu): MenuNode {
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

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async grantedMenus(
    userId: string,
    systemId: string,
  ): Promise<Menu[]> {
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
    const byId = new Map<string, Menu>();
    for (const { role } of user?.roles ?? []) {
      if (role.status !== 'ENABLED' || role.systemId !== systemId) continue;
      for (const { menu } of role.menus) {
        if (menu.status === 'ENABLED') byId.set(menu.id, menu);
      }
    }
    return [...byId.values()].sort(
      (a, b) => a.sort - b.sort || a.id.localeCompare(b.id),
    );
  }

  /** Enabled menus visible to the user in a system; superadmin gets all of them. */
  async getMenus(
    userId: string,
    systemId: string,
    isSuperadmin: boolean,
  ): Promise<Menu[]> {
    if (isSuperadmin) {
      return this.prisma.menu.findMany({
        where: { systemId, status: 'ENABLED' },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      });
    }
    return this.grantedMenus(userId, systemId);
  }

  async getCodes(userId: string, systemId: string): Promise<string[]> {
    const menus = await this.grantedMenus(userId, systemId);
    return [
      ...new Set(
        menus
          .map((m) => m.permissionCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
  }

  async getMenuTree(
    userId: string,
    systemId: string,
    isSuperadmin: boolean,
  ): Promise<MenuNode[]> {
    const menus = await this.getMenus(userId, systemId, isSuperadmin);
    return buildTree(menus.map(toMenuNode));
  }

  async accessibleSystems(
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
          select: { role: { select: { status: true, system: true } } },
        },
      },
    });
    const byId = new Map<string, System>();
    for (const { role } of user?.roles ?? []) {
      if (role.status === 'ENABLED' && role.system.status === 'ENABLED') {
        byId.set(role.system.id, role.system);
      }
    }
    return [...byId.values()].sort((a, b) => a.sort - b.sort);
  }
}
