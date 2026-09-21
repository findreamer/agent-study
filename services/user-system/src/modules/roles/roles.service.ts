import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Role } from '@agent-study/database/prisma';
import type {
  CreateRoleInput,
  RoleDetail,
  RoleListQuery,
  UpdateRoleInput,
} from '@agent-study/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

type RoleWithMenus = Role & { menus: Array<{ menuId: string }> };

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private toDetail(role: Role, menuIds: string[]): RoleDetail {
    return {
      id: role.id,
      systemId: role.systemId,
      code: role.code,
      name: role.name,
      status: role.status,
      priority: role.priority,
      dataScope: role.dataScope,
      remark: role.remark,
      menuIds,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private async menusBelongToSystem(
    systemId: string,
    menuIds: string[],
  ): Promise<boolean> {
    if (menuIds.length === 0) return true;
    const count = await this.prisma.menu.count({
      where: { id: { in: menuIds }, systemId },
    });
    return count === menuIds.length;
  }

  async list(_actor: AuthUser, query: RoleListQuery) {
    const where: Prisma.RoleWhereInput = { systemId: query.systemId };
    if (query.keyword) {
      where.OR = ['name', 'code'].map((field) => ({
        [field]: { contains: query.keyword, mode: 'insensitive' },
      }));
    }
    const skip = (query.page - 1) * query.pageSize;

    const [roles, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        include: { menus: { select: { menuId: true } } },
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      items: roles.map((role) =>
        this.toDetail(role, role.menus.map((m) => m.menuId)),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(_actor: AuthUser, input: CreateRoleInput): Promise<RoleDetail> {
    const system = await this.prisma.system.findUnique({
      where: { id: input.systemId },
      select: { id: true },
    });
    if (!system) {
      throw new UnprocessableEntityException('system not found');
    }
    if (!(await this.menusBelongToSystem(input.systemId, input.menuIds))) {
      throw new UnprocessableEntityException(
        'menus must belong to the role system',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            systemId: input.systemId,
            code: input.code,
            name: input.name,
            status: input.status,
            priority: input.priority,
            dataScope: input.dataScope,
            remark: input.remark ?? null,
          },
        });
        if (input.menuIds.length > 0) {
          await tx.roleMenu.createMany({
            data: input.menuIds.map((menuId) => ({ roleId: role.id, menuId })),
          });
        }
        return this.toDetail(role, input.menuIds);
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('role code already exists in this system');
      }
      throw error;
    }
  }

  async update(
    _actor: AuthUser,
    id: string,
    input: UpdateRoleInput,
  ): Promise<RoleDetail> {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('role not found');

    if (
      input.menuIds &&
      !(await this.menusBelongToSystem(existing.systemId, input.menuIds))
    ) {
      throw new UnprocessableEntityException(
        'menus must belong to the role system',
      );
    }

    const updated = (await this.prisma.$transaction(async (tx) => {
      if (input.menuIds) {
        await tx.roleMenu.deleteMany({ where: { roleId: id } });
        if (input.menuIds.length > 0) {
          await tx.roleMenu.createMany({
            data: input.menuIds.map((menuId) => ({ roleId: id, menuId })),
          });
        }
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.dataScope !== undefined ? { dataScope: input.dataScope } : {}),
          ...(input.remark !== undefined ? { remark: input.remark } : {}),
        },
        include: { menus: { select: { menuId: true } } },
      });
    })) as RoleWithMenus;

    return this.toDetail(
      updated,
      input.menuIds ?? updated.menus.map((m) => m.menuId),
    );
  }

  async remove(_actor: AuthUser, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('role not found');

    const assignedCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });
    if (assignedCount > 0) {
      throw new ConflictException('role is assigned to users');
    }
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }
}
