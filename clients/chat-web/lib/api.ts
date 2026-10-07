const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4001";
const AUTH_BASE = process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://localhost:4002";

const TOKEN_KEY = "chat-web-token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** 登录 user-system（端口 4002），成功返回 accessToken */
export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => null)) as
    | { code?: number; data?: { accessToken?: string }; message?: string }
    | null;
  if (!res.ok || !data?.data?.accessToken) {
    throw new Error(data?.message ?? `登录失败（HTTP ${res.status}）`);
  }
  return data.data.accessToken;
}

/** 携带 JWT 调用 chat 服务的 JSON POST 接口 */
export async function postAuthorized<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    if (res.status === 401) clearToken();
    throw new Error(data?.message ?? `请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as T;
}
