import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefreshToken } from '@agent-study/database/prisma';
import { TokenService, ReuseDetectedException } from './token.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

interface MockRow extends Partial<RefreshToken> {
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

function mockPrisma() {
  const rows: MockRow[] = [];
  const users = new Map<string, { id: string; username: string; isSuperadmin: boolean; status: string }>();
  users.set('u1', { id: 'u1', username: 'admin', isSuperadmin: false, status: 'ACTIVE' });

  return {
    rows,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null),
    },
    refreshToken: {
      create: vi.fn(async ({ data }: { data: Omit<MockRow, 'id' | 'createdAt'> & { id?: string } }) => {
        const row = { id: `rt-${rows.length + 1}`, createdAt: new Date(), ...data } as MockRow;
        rows.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockRow> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<MockRow> }) => {
        const matched = rows.filter((r) =>
          Object.entries(where).every(([k, v]) => {
            const field = (r as unknown as Record<string, unknown>)[k];
            if (v && typeof v === 'object') {
              if ('in' in (v as object)) {
                return (v as { in: unknown[] }).in.includes(field);
              }
              if ('not' in (v as object)) {
                return field !== (v as { not: unknown }).not;
              }
            }
            return field === v;
          }),
        );
        matched.forEach((r) => Object.assign(r, data));
        return { count: matched.length };
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        rows.filter((r) => r.userId === where.userId),
      ),
    },
  };
}

describe('TokenService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let tokens: TokenService;
  const user = { id: 'u1', username: 'admin', isSuperadmin: false };

  beforeEach(() => {
    prisma = mockPrisma();
    tokens = new TokenService(prisma as unknown as PrismaService, new JwtService());
  });

  it('issueFamily persists a usable row and returns both tokens', async () => {
    const out = await tokens.issueFamily(user, 'sys1', { ua: 'jest', ip: '127.0.0.1' });
    expect(out.accessToken).toBeTruthy();
    expect(out.refreshToken).toBeTruthy();
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].rotatedAt).toBeNull();
    expect(prisma.rows[0].revokedAt).toBeNull();
  });

  it('rotate issues new tokens and marks the old row rotated within the same family', async () => {
    const first = await tokens.issueFamily(user, 'sys1', {});
    const second = await tokens.rotate(first.refreshToken, {});
    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(prisma.rows).toHaveLength(2);
    expect(prisma.rows[0].rotatedAt).toBeInstanceOf(Date);
    expect(prisma.rows[1].familyId).toBe(prisma.rows[0].familyId);
    expect(prisma.rows[1].systemId).toBe('sys1');
    const payload = await new JwtService().verifyAsync(second.accessToken, { secret: process.env.JWT_SECRET });
    expect(payload.sub).toBe('u1');
    expect(payload.systemId).toBe('sys1');
  });

  it('reusing a rotated token revokes the whole family and throws', async () => {
    const first = await tokens.issueFamily(user, 'sys1', {});
    const second = await tokens.rotate(first.refreshToken, {});
    await expect(tokens.rotate(first.refreshToken, {})).rejects.toBeInstanceOf(ReuseDetectedException);
    expect(prisma.rows.every((r) => r.revokedAt instanceof Date)).toBe(true);
    // the freshly rotated token from the legitimate rotation must also be dead
    const hash = await TokenService.hashToken(second.refreshToken);
    expect(prisma.rows.find((r) => r.tokenHash === hash)?.revokedAt).toBeInstanceOf(Date);
  });

  it('rotate with an unknown or expired token throws 401', async () => {
    await expect(tokens.rotate('not-a-real-token', {})).rejects.toBeInstanceOf(UnauthorizedException);
    const issued = await tokens.issueFamily(user, 'sys1', {});
    prisma.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(tokens.rotate(issued.refreshToken, {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokeOthers keeps only the given family alive', async () => {
    const a = await tokens.issueFamily(user, 'sys1', {});
    const b = await tokens.issueFamily(user, 'sys1', {});
    const hashA = await TokenService.hashToken(a.refreshToken);
    const hashB = await TokenService.hashToken(b.refreshToken);
    const familyA = prisma.rows.find((r) => r.tokenHash === hashA)!.familyId;
    const familyB = prisma.rows.find((r) => r.tokenHash === hashB)!.familyId;
    await tokens.revokeOthers('u1', familyA);
    expect(prisma.rows.find((r) => r.familyId === familyA)?.revokedAt).toBeNull();
    expect(prisma.rows.find((r) => r.familyId === familyB)?.revokedAt).toBeInstanceOf(Date);
  });

  it('reissueAccessToken signs a token carrying the new system id', async () => {
    const at = await tokens.reissueAccessToken(user, 'sys2');
    const payload = await new JwtService().verifyAsync(at, {
      secret: process.env.JWT_SECRET,
    });
    expect(payload.systemId).toBe('sys2');
    expect(payload.sub).toBe('u1');
  });
});
