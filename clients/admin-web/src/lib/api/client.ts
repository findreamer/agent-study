const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4002';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

interface AuthHooks {
  accessToken: string | null;
  applyRefreshedToken: (token: string) => void;
}

let hooks: AuthHooks = {
  accessToken: null,
  applyRefreshedToken: () => {},
};
let clearStore: (() => void) | null = null;

export function registerAuthHooks(next: AuthHooks): void {
  hooks = next;
}

export function registerClearStore(fn: () => void): void {
  clearStore = fn;
}

let refreshing: Promise<boolean> | null = null;

/** Refresh the access token once; concurrent callers share the same promise. */
export async function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const body = (await res.json()) as {
          code: 0;
          data: { accessToken: string };
        };
        hooks.applyRefreshedToken(body.data.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return requestWithAuth<T>(path, init, false);
}

async function requestWithAuth<T>(
  path: string,
  init: RequestInit,
  retried: boolean,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (hooks.accessToken) headers.set('Authorization', `Bearer ${hooks.accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !retried) {
    const ok = await refreshOnce();
    if (!ok) {
      clearStore?.();
      throw new ApiError(401, 'unauthorized');
    }
    return requestWithAuth<T>(path, init, true);
  }

  const body = (await res.json().catch(() => null)) as
    | { code: number; data: T; message: string; issues?: unknown }
    | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? res.statusText, body?.issues);
  }
  return body!.data;
}
