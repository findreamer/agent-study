import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  User,
} from '@agent-study/database/prisma';
import type {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
  UserDetail,
  UserListQuery,
} from '@agent-study/contracts';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';
import { PasswordService } from '../../common/auth/password.service.js';
import { TokenService } from '../../common/auth/token.service.js';
import { DataScopeService } from '../../common/rbac/data-scope.service.js';

type UserWithRoles = User & {
  roles: Array<{ roleId: string }>;
  department: { name: string } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly dataScope: DataScopeService,
  ) {}

  private toDetail(user: UserWithRoles): UserDetail {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      status: user.status,
      isSuperadmin: user.isSuperadmin,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      roleIds: user.roles.map((r) => r.roleId),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async list(actor: AuthUser, query: UserListQuery) {
    const scope = await this.dataScope.buildFilter(actor, actor.systemId);
    const AND: Prisma.UserWhereInput[] = [scope];
    if (query.keyword) {
      AND.push({
        OR: ['username', 'nickname'].map((field) => ({
          [field]: { contains: query.keyword, mode: 'insensitive' },
        })),
      });
    }
    if (query.departmentId) AND.push({ departmentId: query.departmentId });

    const where: Prisma.UserWhereInput = { AND };
    const skip = (query.page - 1) * query.pageSize;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        omit: { passwordHash: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        email: u.email,
        status: u.status,
        isSuperadmin: u.isSuperadmin,
        departmentId: u.departmentId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async detail(actor: AuthUser, id: string): Promise<UserDetail> {
    const scope = await this.dataScope.buildFilter(actor, actor.systemId);
    const user = (await this.prisma.user.findFirst({
      where: { AND: [{ id }, scope] },
      include: {
        roles: { select: { roleId: true } },
        department: { select: { name: true } },
      },
    })) as UserWithRoles | null;
    if (!user) throw new NotFoundException('user not found');
    return this.toDetail(user);
  }

  async create(actor: AuthUser, input: CreateUserInput): Promise<Omit<User, 'passwordHash'>> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction((tx) =>
        tx.user.create({
          data: {
            username: input.username,
            nickname: input.nickname,
            email: input.email ?? null,
            departmentId: input.departmentId ?? null,
            passwordHash,
            roles: {
              create: input.roleIds.map((roleId) => ({ roleId })),
            },
          },
          omit: { passwordHash: true },
        }),
      );
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('username already exists');
      }
      throw error;
    }
  }

  async update(
    actor: AuthUser,
    id: string,
    input: UpdateUserInput,
  ): Promise<UserDetail> {
    const updated = (await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('user not found');

      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (input.roleIds.length > 0) {
          await tx.userRole.createMany({
            data: input.roleIds.map((roleId) => ({ userId: id, roleId })),
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.departmentId !== undefined
            ? { departmentId: input.departmentId }
            : {}),
        },
        include: {
          roles: { select: { roleId: true } },
          department: { select: { name: true } },
        },
      });
    })) as UserWithRoles;

    if (input.status === 'DISABLED') {
      await this.tokens.revokeAllFamilies(id);
    }
    return this.toDetail(updated);
  }

  async resetPassword(
    actor: AuthUser,
    id: string,
    input: ResetPasswordInput,
  ): Promise<UserDetail> {
    const existing = await this.prisma.user.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('user not found');

    const passwordHash = await this.passwords.hash(input.newPassword);
    const updated = (await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      include: {
        roles: { select: { roleId: true } },
        department: { select: { name: true } },
      },
    })) as UserWithRoles;

    await this.tokens.revokeAllFamilies(id);
    return this.toDetail(updated);
  }
}
