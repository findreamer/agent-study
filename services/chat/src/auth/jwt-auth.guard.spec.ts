import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(authorization?: string) {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function makeGuard(payload: Record<string, unknown> | Error) {
  const jwt = {
    verifyAsync: vi.fn().mockImplementation(() =>
      payload instanceof Error ? Promise.reject(payload) : Promise.resolve(payload),
    ),
  } as unknown as JwtService;
  return { guard: new JwtAuthGuard(jwt), jwt };
}

describe('JwtAuthGuard', () => {
  it('有效 token：req.user 取到 payload.sub 与 username', async () => {
    const { guard } = makeGuard({ sub: 'user-1', username: 'admin' });
    const { request, context } = makeContext('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', username: 'admin' });
  });

  it('缺少 Authorization 头时 401', async () => {
    const { guard } = makeGuard({ sub: 'user-1' });
    await expect(guard.canActivate(makeContext(undefined).context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('非 Bearer 前缀时 401', async () => {
    const { guard } = makeGuard({ sub: 'user-1' });
    await expect(guard.canActivate(makeContext('Basic xxx').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('验签失败（过期/伪造）时 401', async () => {
    const { guard } = makeGuard(new Error('jwt expired'));
    await expect(
      guard.canActivate(makeContext('Bearer expired-token').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('payload 缺 sub 时 401', async () => {
    const { guard } = makeGuard({ username: 'admin' });
    await expect(guard.canActivate(makeContext('Bearer ok').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
