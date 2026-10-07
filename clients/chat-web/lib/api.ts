// 仅限客户端（"use client" 组件的事件处理器）调用：token 存 localStorage，服务端环境没有
// window，这里会抛 401 而不是发请求。将来若需 SSR 首屏取数（Server Component / Route Handler），
// 应另建 serverApiPost 走 httpOnly cookie + next/headers 读取，不要与本文件合并。
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

/** 带状态码的业务错误：调用方按 status 决定是否回登录页 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
    throw new ApiError(res.status, data?.message ?? `登录失败（HTTP ${res.status}）`);
  }
  return data.data.accessToken;
}

/**
 * 统一请求封装：自动附加 localStorage 中的 token；
 * 401 时自动清除登录态并抛 ApiError(401)，调用方据此回到登录页。
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = getStoredToken();
  if (!token) {
    throw new ApiError(401, "登录已失效，请重新登录");
  }
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
    throw new ApiError(res.status, data?.message ?? `请求失败（HTTP ${res.status}）`);
  }
  return (await res.json()) as T;
}
