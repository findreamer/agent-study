import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '@agent-study/database';
import { env } from '../config/env.js';
import {
  RT_TTL_MS,
  type JwtPayload,
  type SessionInfo,
  type TokenContext,
} from './auth.constants.js';

export class ReuseDetectedException extends UnauthorizedException {
  constructor() {
    super('token reuse detected');
  }
}

interface TokenUser {
  id: string;
  username: string;
  isSuperadmin: boolean;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hashToken(raw: string): Promise<string> {
    return Promise.resolve(createHash('sha256').update(raw).digest('hex'));
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private signAccessToken(user: TokenUser, systemId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      isSuperadmin: user.isSuperadmin,
      systemId,
    };
    return this.jwt.signAsync(payload, {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_AT_TTL,
    });
  }

  private async persistNewToken(
    userId: string,
    familyId: string,
    systemId: string,
    ctx: TokenContext,
  ): Promise<string> {
    const raw = this.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        systemId,
        tokenHash: await TokenService.hashToken(raw),
        expiresAt: new Date(Date.now() + RT_TTL_MS),
        rotatedAt: null,
        revokedAt: null,
        reuseFlaggedAt: null,
        userAgent: ctx.ua ?? null,
        ip: ctx.ip ?? null,
      },
    });
    return raw;
  }

  async issueFamily(
    user: TokenUser,
    systemId: string,
    ctx: TokenContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const familyId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user, systemId),
      this.persistNewToken(user.id, familyId, systemId, ctx),
    ]);
    return { accessToken, refreshToken };
  }

  /** Re-sign an access token for an existing session (used by system switching). */
  async reissueAccessToken(user: TokenUser, systemId: string): Promise<string> {
    return this.signAccessToken(user, systemId);
  }

  private async revokeFamily(familyId: string, flagReuse = false): Promise<void> {
    const data = flagReuse
      ? { revokedAt: new Date(), reuseFlaggedAt: new Date() }
      : { revokedAt: new Date() };
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data,
    });
  }

  async revokeFamilyById(familyId: string): Promise<void> {
    await this.revokeFamily(familyId);
  }

  async revokeAllFamilies(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Point a family's active rows at a new system after a system switch. */
  async touchFamilySystem(familyId: string, systemId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, rotatedAt: null, revokedAt: null },
      data: { systemId },
    });
  }

  async revokeOthers(userId: string, keepFamilyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, familyId: { not: keepFamilyId } },
      data: { revokedAt: new Date() },
    });
  }

  async familyIdOfRaw(raw: string): Promise<string | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: await TokenService.hashToken(raw) },
      select: { familyId: true },
    });
    return row?.familyId ?? null;
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token, { secret: env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('invalid access token');
    }
  }

  async rotate(
    rawRefreshToken: string,
    ctx: TokenContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: await TokenService.hashToken(rawRefreshToken) },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (row.rotatedAt || row.revokedAt) {
      await this.revokeFamily(row.familyId, true);
      throw new ReuseDetectedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: { id: true, username: true, isSuperadmin: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('user is not active');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { rotatedAt: new Date() },
    });

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user, row.systemId),
      this.persistNewToken(user.id, row.familyId, row.systemId, ctx),
    ]);
    return { accessToken, refreshToken };
  }

  async listFamilies(
    userId: string,
    currentFamilyId: string | null,
  ): Promise<SessionInfo[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const byFamily = new Map<string, SessionInfo>();
    for (const row of rows) {
      const existing = byFamily.get(row.familyId);
      const lastUsedAt = row.rotatedAt ?? row.createdAt;
      if (
        !existing ||
        (existing.lastUsedAt ? new Date(existing.lastUsedAt).getTime() : 0) <
          lastUsedAt.getTime()
      ) {
        byFamily.set(row.familyId, {
          familyId: row.familyId,
          userAgent: row.userAgent,
          ip: row.ip,
          lastUsedAt: lastUsedAt.toISOString(),
          current: row.familyId === currentFamilyId,
        });
      }
    }
    return [...byFamily.values()];
  }
}
