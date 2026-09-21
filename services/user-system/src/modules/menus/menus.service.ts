import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Menu } from '@agent-study/database/prisma';
import type {
  CreateMenuInput,
  MenuDetail,
  MenuNode,
  MenuTreeQuery,
  UpdateMenuInput,
} from '@agent-study/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { buildTree } from '../../common/rbac/build-tree.js';
import { toMenuNode } from '../../common/rbac/permissions.service.js';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  private toDetail(menu: Menu): MenuDetail {
    return {
      id: menu.id,
      systemId: menu.systemId,
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
      createdAt: menu.createdAt.toISOString(),
      updatedAt: menu.updatedAt.toISOString(),
    };
  }

  private async getMenuAndDescendantIds(rootId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM "Menu" WHERE id = ${rootId}
        UNION ALL
        SELECT m.id FROM "Menu" m JOIN tree t ON m."parentId" = t.id
      )
      SELECT id FROM tree
    `;
    return rows.map((r) => r.id);
  }

  async tree(query: MenuTreeQuery): Promise<MenuNode[]> {
    const menus = await this.prisma.menu.findMany({
      where: { systemId: query.systemId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return buildTree(menus.map(toMenuNode));
  }

  async create(input: CreateMenuInput): Promise<MenuDetail> {
    const system = await this.prisma.system.findUnique({
      where: { id: input.systemId },
      select: { id: true },
    });
    if (!system) {
      throw new UnprocessableEntityException('system not found');
    }

    if (input.parentId) {
      const parent = await this.prisma.menu.findUnique({
        where: { id: input.parentId },
        select: { systemId: true },
      });
      if (!parent || parent.systemId !== input.systemId) {
        throw new UnprocessableEntityException(
          'parent menu must exist in the same system',
        );
      }
    }

    try {
      const created = await this.prisma.menu.create({ data: input });
      return this.toDetail(created);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('permission code already exists in this system');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateMenuInput): Promise<MenuDetail> {
    const existing = await this.prisma.menu.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('menu not found');

    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new UnprocessableEntityException('menu cannot be its own parent');
      }
      if (input.parentId) {
        const descendantIds = await this.getMenuAndDescendantIds(id);
        if (descendantIds.includes(input.parentId)) {
          throw new UnprocessableEntityException(
            'cannot move a menu under its own descendant',
          );
        }
        const parent = await this.prisma.menu.findUnique({
          where: { id: input.parentId },
          select: { systemId: true },
        });
        if (!parent || parent.systemId !== existing.systemId) {
          throw new UnprocessableEntityException(
            'parent menu must exist in the same system',
          );
        }
      }
    }

    const updated = await this.prisma.menu.update({
      where: { id },
      data: input,
    });
    return this.toDetail(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.menu.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('menu not found');

    const childCount = await this.prisma.menu.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('menu has children');
    }
    await this.prisma.menu.delete({ where: { id } });
    return { ok: true };
  }
}
