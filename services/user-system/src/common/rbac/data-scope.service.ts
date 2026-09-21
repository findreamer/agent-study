import { Injectable } from '@nestjs/common';
import type { DataScope, Prisma } from '@agent-study/database/prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.constants.js';

const SCOPE_RANK: Record<DataScope, number> = {
  SELF: 0,
  DEPT: 1,
  DEPT_AND_SUB: 2,
  ALL: 3,
};

@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async getDepartmentAndDescendantIds(rootId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT id FROM "Department" WHERE id = ${rootId}
        UNION ALL
        SELECT d.id FROM "Department" d JOIN tree t ON d."parentId" = t.id
      )
      SELECT id FROM tree
    `;
    return rows.map((r) => r.id);
  }

  private widest(scopes: DataScope[]): DataScope {
    return scopes.reduce((widest, current) =>
      SCOPE_RANK[current] > SCOPE_RANK[widest] ? current : widest,
    );
  }

  /** Prisma where fragment for the User model, scoped by the user's widest role. */
  async buildFilter(
    user: AuthUser,
    systemId: string,
  ): Promise<Prisma.UserWhereInput> {
    if (user.isSuperadmin) return {};

    const roles = await this.prisma.role.findMany({
      where: {
        systemId,
        status: 'ENABLED',
        users: { some: { userId: user.id } },
      },
      select: { dataScope: true },
    });
    if (roles.length === 0) return { id: user.id };

    switch (this.widest(roles.map((r) => r.dataScope))) {
      case 'ALL':
        return {};
      case 'DEPT_AND_SUB':
        if (!user.departmentId) return { id: user.id };
        return {
          departmentId: {
            in: await this.getDepartmentAndDescendantIds(user.departmentId),
          },
        };
      case 'DEPT':
        if (!user.departmentId) return { id: user.id };
        return { departmentId: user.departmentId };
      case 'SELF':
        return { id: user.id };
    }
  }
}
