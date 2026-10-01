import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  registerAuthHooks,
  registerClearStore,
} from './client';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ok = (data: unknown) => jsonResponse(200, { code: 0, data, message: 'ok' });

describe('apiFetch', () => {
  let fetchMock: FetchMock;
  let token: string | null;
  const clear = vi.fn();

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    token = 'at1';
    clear.mockClear();
    registerAuthHooks({
      get accessToken() {
        return token;
      },
      applyRefreshedToken: (t) => {
        token = t || null;
      },
    });
    registerClearStore(clear);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches bearer token and unwraps the response shell', async () => {
    fetchMock.mockResolvedValueOnce(ok({ hello: 'world' }));
    const data = await apiFetch<{ hello: string }>('/api/users');
    expect(data).toEqual({ hello: 'world' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('http://localhost:4002/api/users');
    expect(init.headers.get('Authorization')).toBe('Bearer at1');
    expect(init.credentials).toBe('include');
  });

  it('single-flights refresh on concurrent 401s and retries once', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Headers)?.get('Authorization');
      if (String(url).endsWith('/api/auth/refresh')) {
        return jsonResponse(200, {
          code: 0,
          data: { accessToken: 'at2' },
          message: 'ok',
        });
      }
      if (auth === 'Bearer at2') return ok({ n: 1 });
      return jsonResponse(401, { code: 401, message: 'unauthorized' });
    });

    const [a, b] = await Promise.all([
      apiFetch('/api/users'),
      apiFetch('/api/roles'),
    ]);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    const refreshCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith('/api/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears the session and throws 401 when refresh fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/api/auth/refresh')
        ? jsonResponse(401, { code: 401, message: 'unauthorized' })
        : jsonResponse(401, { code: 401, message: 'unauthorized' }),
    );
    await expect(apiFetch('/api/users')).rejects.toMatchObject({
      status: 401,
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on 403', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { code: 403, message: 'forbidden' }),
    );
    await expect(apiFetch('/api/users')).rejects.toBeInstanceOf(ApiError);
    const refreshCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).endsWith('/api/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(0);
  });

  it('surfaces 422 issues on ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        code: 422,
        message: 'Validation failed',
        issues: [{ path: 'username', message: 'too short' }],
      }),
    );
    const error = (await apiFetch('/api/users').catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.issues).toEqual([
      { path: 'username', message: 'too short' },
    ]);
  });
});
