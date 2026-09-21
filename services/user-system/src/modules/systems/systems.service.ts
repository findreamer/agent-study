import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { System } from '@agent-study/database/prisma';
import type {
  CreateSystemInput,
  SystemDetail,
  UpdateSystemInput,
} from '@agent-study/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';

@Injectable()
export class SystemsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDetail(system: System): SystemDetail {
    return {
      id: system.id,
      code: system.code,
      name: system.name,
      status: system.status,
      sort: system.sort,
      createdAt: system.createdAt.toISOString(),
      updatedAt: system.updatedAt.toISOString(),
    };
  }

  async list(): Promise<SystemDetail[]> {
    const systems = await this.prisma.system.findMany({ orderBy: { sort: 'asc' } });
    return systems.map((s) => this.toDetail(s));
  }

  async create(_actor: AuthUser, input: CreateSystemInput): Promise<SystemDetail> {
    try {
      const created = await this.prisma.system.create({ data: input });
      return this.toDetail(created);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('system code already exists');
      }
      throw error;
    }
  }

  async update(
    _actor: AuthUser,
    id: string,
    input: UpdateSystemInput,
  ): Promise<SystemDetail> {
    const existing = await this.prisma.system.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('system not found');
    const updated = await this.prisma.system.update({ where: { id }, data: input });
    return this.toDetail(updated);
  }

  async remove(_actor: AuthUser, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.system.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('system not found');

    const [roleCount, menuCount] = await Promise.all([
      this.prisma.role.count({ where: { systemId: id } }),
      this.prisma.menu.count({ where: { systemId: id } }),
    ]);
    if (roleCount > 0 || menuCount > 0) {
      throw new ConflictException('system has roles or menus');
    }
    await this.prisma.system.delete({ where: { id } });
    return { ok: true };
  }
}
