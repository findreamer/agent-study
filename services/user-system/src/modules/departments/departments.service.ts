import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateDepartmentInput,
  DepartmentNode,
  UpdateDepartmentInput,
} from '@agent-study/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { buildTree } from '../../common/rbac/build-tree.js';
import { DataScopeService } from '../../common/rbac/data-scope.service.js';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScope: DataScopeService,
  ) {}

  private toNode(dept: {
    id: string;
    parentId: string | null;
    name: string;
    leader: string | null;
    sort: number;
    status: 'ENABLED' | 'DISABLED';
  }): DepartmentNode {
    return {
      id: dept.id,
      parentId: dept.parentId,
      name: dept.name,
      leader: dept.leader,
      sort: dept.sort,
      status: dept.status,
    };
  }

  async tree(): Promise<DepartmentNode[]> {
    const departments = await this.prisma.department.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return buildTree(departments.map((d) => this.toNode(d)));
  }

  async create(input: CreateDepartmentInput): Promise<DepartmentNode> {
    if (input.parentId) {
      const parent = await this.prisma.department.findUnique({
        where: { id: input.parentId },
        select: { id: true },
      });
      if (!parent) throw new UnprocessableEntityException('parent department not found');
    }
    const created = await this.prisma.department.create({
      data: {
        name: input.name,
        parentId: input.parentId ?? null,
        leader: input.leader ?? null,
        sort: input.sort,
        status: input.status,
      },
    });
    return this.toNode(created);
  }

  async update(id: string, input: UpdateDepartmentInput): Promise<DepartmentNode> {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('department not found');

    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new UnprocessableEntityException('department cannot be its own parent');
      }
      if (input.parentId) {
        const descendantIds = await this.dataScope.getDepartmentAndDescendantIds(id);
        if (descendantIds.includes(input.parentId)) {
          throw new UnprocessableEntityException(
            'cannot move a department under its own descendant',
          );
        }
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.leader !== undefined ? { leader: input.leader } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return this.toNode(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.department.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('department not found');

    const [childCount, userCount] = await Promise.all([
      this.prisma.department.count({ where: { parentId: id } }),
      this.prisma.user.count({ where: { departmentId: id } }),
    ]);
    if (childCount > 0 || userCount > 0) {
      throw new ConflictException('department has children or users');
    }
    await this.prisma.department.delete({ where: { id } });
    return { ok: true };
  }
}
