import { env } from '../config/env.js';

export const REFRESH_COOKIE = 'rt';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const RT_TTL_MS = env.RT_TTL_DAYS * DAY_MS;

export interface TokenContext {
  ua?: string | null;
  ip?: string | null;
}

export interface JwtPayload {
  sub: string;
  username: string;
  isSuperadmin: boolean;
  systemId: string;
}

/** Authenticated principal attached to request.user by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  username: string;
  isSuperadmin: boolean;
  departmentId: string | null;
  systemId: string;
}

export interface SessionInfo {
  familyId: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string | null;
  current: boolean;
}
